import { test, expect, type Page } from '@playwright/test';
const shots = '.codex/local/design/mobile-lowpoly-v1';
async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Khám phá bản trải nghiệm', exact: true }).click();
  await expect(page.getByText('Một hành trình mới bắt đầu')).toBeVisible();
}
async function seed(page: Page) {
  await enter(page);
  await page.getByRole('button', { name: /Xem sảnh với 3 tòa nhà mẫu/ }).click();
  await expect(page.getByText('3 tòa nhà đã lưu')).toBeVisible();
}
async function openAnBinhTraining(page: Page) {
  await page.getByRole('button', { name: 'Mở Chung cư An Bình' }).click();
  await page.getByRole('button', { name: 'Vào tập huấn', exact: true }).click();
  await expect(page.getByText('Chọn bài tập huấn')).toBeVisible();
}
async function startMode(page: Page, mode: 'Learn' | 'Guided Drill' | 'Assessment') {
  await page.getByRole('radio', { name: mode }).click();
  await page.getByRole('button', { name: 'Bắt đầu mô phỏng' }).click();
  await expect(page.getByText(`${mode} · DEMO`)).toBeVisible();
}
test('login, lobby and a complete Guided Drill flow are usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await page.screenshot({ path: `${shots}/01-login.png`, fullPage: true });
  await page.getByRole('button', { name: 'Khám phá bản trải nghiệm', exact: true }).click();
  await expect(page.getByText('Một hành trình mới bắt đầu')).toBeVisible();
  await page.screenshot({ path: `${shots}/02-empty-lobby.png`, fullPage: true });
  await page.getByRole('button', { name: /Xem sảnh với 3 tòa nhà mẫu/ }).click();
  await expect(page.getByText('3 tòa nhà đã lưu')).toBeVisible();
  await page.screenshot({ path: `${shots}/03-building-map.png`, fullPage: true });
  await page.getByRole('button', { name: 'Danh sách tòa nhà' }).click();
  await expect(page.getByRole('textbox', { name: 'Tìm tòa nhà' })).toBeVisible();
  await page.screenshot({ path: `${shots}/04-building-list.png`, fullPage: true });
  await page.getByRole('textbox', { name: 'Tìm tòa nhà' }).fill('an binh');
  await expect(page.getByRole('button', { name: 'Mở Chung cư An Bình' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở Trường học Hoa Sen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mở Chung cư An Bình' }).click();
  await expect(page.getByText('KHÔNG GIAN TẬP HUẤN')).toBeVisible();
  await page.screenshot({
    path: `${shots}/05-training-sheet.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Vào tập huấn', exact: true }).click();
  await expect(page.getByText('Chọn bài tập huấn')).toBeVisible();
  await page.getByRole('radio', { name: 'Guided Drill' }).click();
  await page.getByRole('button', { name: 'Bắt đầu mô phỏng' }).click();
  await expect(page.getByText('Đang chuẩn bị cảnh mô phỏng…')).toBeVisible();
  await page.screenshot({ path: `${shots}/07-preparing.png`, fullPage: true });
  await expect(page.getByText('Guided Drill · DEMO')).toBeVisible();
  await page.screenshot({ path: `${shots}/09-game-guided.png`, fullPage: true });
  await page.getByRole('button', { name: 'Quan sát hành lang' }).click();
  await page.getByRole('button', { name: 'Đi theo các mốc đã quan sát' }).click();
  await page.getByRole('button', { name: 'Chọn nhánh A' }).click();
  await page.getByRole('button', { name: 'Hoàn tất mô phỏng' }).click();
  await expect(page.getByText('Debrief cá nhân')).toBeVisible();
  await expect(page.getByText(/Dữ liệu local-only/)).toBeVisible();
  await page.screenshot({ path: `${shots}/10-debrief.png`, fullPage: true });
  expect(errors).toEqual([]);
});
test('invalid login is rejected and signed-in session survives reload; logout protects routes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('invalid');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Vui lòng nhập địa chỉ email hợp lệ.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('demo@fire3d.vn');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Fire3D123!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Một hành trình mới bắt đầu')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('fire3d.demo.v2') || '{}').signedIn),
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByText('Một hành trình mới bắt đầu')).toBeVisible();
  await page.getByRole('button', { name: 'Mở tài khoản' }).click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await page.goto('/scan');
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
});
test('QR input rejects unknown URLs, saves valid codes and prevents duplicates', async ({
  page,
}) => {
  await enter(page);
  await page.getByRole('button', { name: 'Quét tòa nhà đầu tiên' }).click();
  await page.screenshot({ path: `${shots}/06-qr-scanner.png`, fullPage: true });
  const input = page.getByRole('textbox', { name: 'Mã tòa nhà' });
  await input.fill('https://unknown.test/F3D-ANBINH');
  await page.getByRole('button', { name: 'Tìm tòa nhà', exact: true }).click();
  await expect(page.getByText(/Chưa nhận diện được mã/)).toBeVisible();
  await input.fill('F3D-ANBINH');
  await page.getByRole('button', { name: 'Tìm tòa nhà', exact: true }).click();
  await expect(page.getByText('Đã lưu tòa nhà vào sảnh của bạn.')).toBeVisible();
  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(page.getByText('1 tòa nhà đã lưu')).toBeVisible();
  await page.getByRole('button', { name: 'Quét QR thêm tòa nhà' }).click();
  await page.getByRole('textbox', { name: 'Mã tòa nhà' }).fill('F3D-ANBINH');
  await page.getByRole('button', { name: 'Tìm tòa nhà', exact: true }).click();
  await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(page.getByText('1 tòa nhà đã lưu')).toBeVisible();
});
test('closed training explains the problem and never launches', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Danh sách tòa nhà' }).click();
  await page.getByRole('button', { name: 'Mở Văn phòng Minh Khai' }).click();
  await expect(page.getByText(/Bài tập này đã đóng/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vào tập huấn', exact: true })).toHaveCount(0);
  await page.screenshot({
    path: `${shots}/08-unavailable.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Quét mã QR mới' }).click();
  await expect(page.getByText('Quét QR tòa nhà')).toBeVisible();
});
test('reduced motion and clear flow work at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await page.getByRole('button', { name: 'Mở tài khoản' }).click();
  await page.getByRole('switch', { name: 'Giảm chuyển động' }).click();
  await page.getByRole('button', { name: 'Xóa danh sách tòa nhà mẫu' }).click();
  await page.getByRole('button', { name: 'Giữ lại', exact: true }).click();
  await expect(page.getByText('3 tòa nhà đã lưu trên thiết bị này.')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa danh sách tòa nhà mẫu' }).click();
  await page.getByRole('button', { name: 'Xóa danh sách', exact: true }).click();
  await expect(page.getByText('0 tòa nhà đã lưu trên thiết bị này.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Giảm chuyển động' })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('unscanned building deep links do not expose training', async ({ page }) => {
  await enter(page);
  await page.goto('/training/an-binh');
  await expect(page.getByText('Không tìm thấy tòa nhà')).toBeVisible();
});

test('Learn keeps hints visible and stores a scoreless local result', async ({ page }) => {
  await seed(page);
  await openAnBinhTraining(page);
  await startMode(page, 'Learn');
  await expect(page.getByText('GỢI Ý MÔ PHỎNG')).toBeVisible();
  await page.getByRole('button', { name: 'Quan sát hành lang' }).click();
  await page.getByRole('button', { name: 'Đi theo các mốc đã quan sát' }).click();
  await page.getByRole('button', { name: 'Chọn nhánh A' }).click();
  await page.getByRole('button', { name: 'Hoàn tất mô phỏng' }).click();
  await expect(page.getByText(/ĐÃ HOÀN THÀNH · LEARN/)).toBeVisible();
  await expect(page.getByText('Điểm mô phỏng')).toHaveCount(0);
  await page.getByRole('button', { name: 'Về danh sách kết quả' }).click();
  await expect(page.getByRole('button', { name: /Xem kết quả Khói xuất hiện/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Xem kết quả Khói xuất hiện/ })).toBeVisible();
});

test('Assessment hides hints, records a blocked route and creates a score', async ({ page }) => {
  await seed(page);
  await openAnBinhTraining(page);
  await startMode(page, 'Assessment');
  await expect(page.getByText('GỢI Ý MÔ PHỎNG')).toHaveCount(0);
  await page.getByRole('button', { name: 'Quan sát hành lang' }).click();
  await page.getByRole('button', { name: 'Đi theo các mốc đã quan sát' }).click();
  await page.getByRole('button', { name: 'Chọn nhánh B' }).click();
  await expect(page.getByText('Re-plan theo trạng thái mới')).toBeVisible();
  await page.getByRole('button', { name: 'Đổi sang nhánh A' }).click();
  await page.getByRole('button', { name: 'Hoàn tất mô phỏng' }).click();
  await expect(page.getByText('Điểm mô phỏng')).toBeVisible();
  await expect(page.getByText(/Bạn đã gặp một nhánh bị chặn/)).toBeVisible();
});

test('paused checkpoint survives reload and can resume from the training screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await openAnBinhTraining(page);
  await startMode(page, 'Guided Drill');
  await page.getByRole('button', { name: 'Quan sát hành lang' }).click();
  await page.getByRole('button', { name: 'Tạm dừng mô phỏng' }).click();
  await expect(page.getByText('Đã tạm dừng')).toBeVisible();
  await page.getByRole('button', { name: 'Lưu và về sảnh' }).click();
  await page.reload();
  await openAnBinhTraining(page);
  await expect(page.getByRole('button', { name: 'Tiếp tục phiên đã lưu' })).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục phiên đã lưu' }).click();
  await expect(page.getByText('Tiến tới nút giao trong mô hình')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('unknown session deep links are guarded', async ({ page }) => {
  await enter(page);
  await page.goto('/game/not-a-session');
  await expect(page.getByText(/Phiên mô phỏng không tồn tại/)).toBeVisible();
  await page.goto('/results/not-a-session');
  await expect(page.getByText('Không tìm thấy kết quả')).toBeVisible();
});
