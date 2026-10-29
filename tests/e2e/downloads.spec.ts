import { expect, test, type Page } from '@playwright/test';

// "Bài đã tải" on Expo web: records are written by the native download flow, so they are seeded into AsyncStorage
// (localStorage on web). Replay always goes back through BE (QR, allowed list, start); web has no Unity package.
const token = 'c'.repeat(43);
const buildingId = '11111111-1111-4111-8111-111111111111';
const trainingId = '77777777-7777-4777-8777-777777777777';
const releaseId = '33333333-3333-4333-8333-333333333333';
const user = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'trainee@example.test',
  fullName: 'Trainee Flow',
  role: 'Trainee',
  organizationId: null,
};
const otherUserId = '99999999-9999-4999-8999-999999999999';

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

function record(overrides: Record<string, unknown> = {}) {
  return {
    trainingId,
    trainingName: 'Thoát hiểm tầng 3',
    buildingId,
    buildingName: 'Tòa nhà B',
    qrToken: token,
    releaseId,
    manifestHash: 'b'.repeat(64),
    runtimeVersion: '2.0.2',
    savedAt: '2026-10-29T08:00:00.000Z',
    ...overrides,
  };
}

async function seed(page: Page, accountId: string, items: unknown[]) {
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    `fire3d.training.downloads.v1.${accountId}`,
    JSON.stringify({ version: 1, items }),
  ] as const);
}

async function signIn(page: Page, items: unknown[] = [record()], owner = user.id) {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(json({ accessToken: 'access', refreshToken: 'refresh', user })),
  );
  await page.route('**/api/auth/me', (route) => route.fulfill(json(user)));
  await page.route('**/api/me/avatar', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route(
    (url) => url.pathname === '/api/training/sessions',
    (route) => route.fulfill(json({ items: [], totalCount: 0, page: 1, pageSize: 20 })),
  );
  await page.goto('/login');
  await seed(page, owner, items);
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Vào game', exact: true }).click();
  await page.getByRole('button', { name: 'Bài đã tải' }).click();
}

function building(overrides: Record<string, unknown> = {}) {
  return {
    buildingId,
    buildingName: 'Tòa nhà B',
    visibility: 'Public',
    hasAccess: true,
    serviceStatus: 'Active',
    serviceEndsAt: null,
    canStartNewSessions: true,
    ...overrides,
  };
}

function trainings(release = releaseId) {
  return [
    {
      id: trainingId,
      releaseId: release,
      name: 'Thoát hiểm tầng 3',
      description: null,
      allowedModes: ['Learn', 'Assessment'],
    },
  ];
}

async function mockQr(page: Page, qr: () => object, list: () => object[] = () => trainings()) {
  await page.route(`**/api/qr/${token}`, (route) => route.fulfill(qr()));
  await page.route(`**/api/qr/${token}/trainings`, (route) => route.fulfill(json(list())));
}

test('the list is per account, kept after a reload, and shows the data on this device', async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByText('Thoát hiểm tầng 3')).toBeVisible();
  await expect(page.getByText(/Tòa nhà B · tải ngày 29\/10/)).toBeVisible();
  await expect(page.getByText('Chưa có dữ liệu trên máy')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Thoát hiểm tầng 3')).toBeVisible();
  await expect(page.getByText(/qr|token|https/i)).toHaveCount(0);
});

test('another account sees none of these downloads', async ({ page }) => {
  await signIn(page, [record()], otherUserId);
  await expect(page.getByText('Chưa có bài đã tải')).toBeVisible();
  await expect(page.getByText('Thoát hiểm tầng 3')).toHaveCount(0);
});

test('replay with the same release goes back to choosing a mode, checked online', async ({
  page,
}) => {
  let qrCalls = 0;
  await mockQr(page, () => {
    qrCalls++;
    return json(building());
  });
  await signIn(page);
  await page.getByRole('button', { name: 'Chơi lại Thoát hiểm tầng 3' }).click();
  await expect(page.getByText('CHỌN CÁCH CHƠI')).toBeVisible();
  await expect(page.getByText(/Bài có phiên bản mới/)).toHaveCount(0);
  expect(qrCalls).toBe(1);
});

test('a newer release says the package will be updated', async ({ page }) => {
  await mockQr(
    page,
    () => json(building()),
    () => trainings('88888888-8888-4888-8888-888888888888'),
  );
  await signIn(page);
  await page.getByRole('button', { name: 'Chơi lại Thoát hiểm tầng 3' }).click();
  await expect(page.getByText(/Bài có phiên bản mới/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chuẩn bị phiên' })).toBeVisible();
});

test('a revoked QR explains in Vietnamese and offers scanning again, not the cached game', async ({
  page,
}) => {
  await mockQr(page, () => json({ code: 'QR_REVOKED', title: 'Gone' }, 410));
  await signIn(page);
  await page.getByRole('button', { name: 'Chơi lại Thoát hiểm tầng 3' }).click();
  await expect(page.getByText('Mã QR này đã bị thu hồi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chuẩn bị phiên' })).toHaveCount(0);
  await expect(page.getByText(/QR_REVOKED/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Quét lại mã QR' }).click();
  await expect(page).toHaveURL(/\/scan-qr/);
});

test('lost access asks for the participation code', async ({ page }) => {
  await mockQr(page, () => json(building({ visibility: 'Private', hasAccess: false })));
  await signIn(page);
  await page.getByRole('button', { name: 'Chơi lại Thoát hiểm tầng 3' }).click();
  await expect(page.getByText('Quyền vào tòa nhà đã thay đổi')).toBeVisible();
  await page.getByRole('button', { name: 'Nhập mã tham gia' }).click();
  await expect(page).toHaveURL(new RegExp(`/qr/${token}`));
});

test('a training removed from the Building list cannot be replayed', async ({ page }) => {
  await mockQr(
    page,
    () => json(building()),
    () => [],
  );
  await signIn(page);
  await page.getByRole('button', { name: 'Chơi lại Thoát hiểm tầng 3' }).click();
  await expect(page.getByText(/không còn trong danh sách/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở danh sách bài của tòa nhà' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chuẩn bị phiên' })).toHaveCount(0);
});

test('offline: the list stays visible but no new play can start', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('Thoát hiểm tầng 3')).toBeVisible();
  await page.route('**/api/auth/me', (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await page.getByRole('button', { name: 'Bài đã tải' }).click();
  await expect(page.getByText('Bạn đang offline')).toBeVisible();
  await expect(page.getByText('Thoát hiểm tầng 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chơi lại Thoát hiểm tầng 3' })).toBeDisabled();
});
