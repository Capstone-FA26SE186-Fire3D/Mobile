import { expect, test } from '@playwright/test';

test('trainee registration uses OTP proof before creating the account', async ({ page }) => {
  const requests: { path: string; body: unknown }[] = [];
  let usernameTaken = true;
  await page.route('**/api/auth/registration/request-otp', async (route) => {
    requests.push({ path: 'request-otp', body: route.request().postDataJSON() });
    await route.fulfill({ status: 202, body: '' });
  });
  await page.route('**/api/auth/registration/verify-otp', async (route) => {
    requests.push({ path: 'verify-otp', body: route.request().postDataJSON() });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ registrationToken: 'proof-1', expiresAt: '2030-01-01T00:00:00Z' }),
    });
  });
  await page.route('**/api/auth/register/trainee', async (route) => {
    requests.push({ path: 'register', body: route.request().postDataJSON() });
    if (usernameTaken) {
      usernameTaken = false;
      await route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code: 'USERNAME_EXISTS', title: 'Username is taken' }),
      });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'new@example.test',
        username: 'nguyen.van.a',
        fullName: 'Nguyễn Văn A',
        role: 'Trainee',
        organizationId: null,
      }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Chưa có tài khoản? Đăng ký' }).click();
  await page.getByRole('textbox', { name: 'Họ và tên' }).fill('Nguyễn Văn A');
  await page.getByRole('textbox', { name: 'Email' }).fill('NEW@EXAMPLE.TEST');
  await page.getByRole('textbox', { name: 'Username' }).fill('Nguyen.Van.A');
  await page.getByLabel('Mật khẩu mới').fill('StrongPassword12!');
  await page.getByLabel('Xác nhận mật khẩu').fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Gửi mã xác minh' }).click();
  await expect(page.getByText('Xác minh email')).toBeVisible();
  expect(requests).toEqual([{ path: 'request-otp', body: { email: 'new@example.test' } }]);
  await page.getByRole('button', { name: 'Xác thực và đăng ký' }).click();
  await expect(page.getByText('Vui lòng nhập mã xác minh gồm 6 chữ số.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Mã xác minh' }).fill('123456');
  await page.getByRole('button', { name: 'Xác thực và đăng ký' }).click();
  await expect(page.getByText(/Username này đã được sử dụng/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Username xác minh' }).fill('nguyen.van.b');
  await page.getByRole('button', { name: 'Xác thực và đăng ký' }).click();
  await expect(page.getByText('Đã tạo tài khoản')).toBeVisible();
  expect(requests[1]).toEqual({
    path: 'verify-otp',
    body: { email: 'new@example.test', otp: '123456' },
  });
  expect(requests[2]).toEqual({
    path: 'register',
    body: {
      fullName: 'Nguyễn Văn A',
      email: 'new@example.test',
      username: 'nguyen.van.a',
      password: 'StrongPassword12!',
      confirmPassword: 'StrongPassword12!',
      dob: null,
      gender: null,
      phoneNumber: null,
      registrationToken: 'proof-1',
    },
  });
  expect(requests[3]).toEqual({
    path: 'register',
    body: {
      fullName: 'Nguyễn Văn A',
      email: 'new@example.test',
      username: 'nguyen.van.b',
      password: 'StrongPassword12!',
      confirmPassword: 'StrongPassword12!',
      dob: null,
      gender: null,
      phoneNumber: null,
      registrationToken: 'proof-1',
    },
  });
});

test('duplicate email stops before OTP verification', async ({ page }) => {
  let verificationCalls = 0;
  await page.route('**/api/auth/registration/request-otp', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      body: JSON.stringify({ code: 'EMAIL_EXISTS', title: 'Email exists' }),
    });
  });
  await page.route('**/api/auth/registration/verify-otp', async (route) => {
    verificationCalls += 1;
    await route.fulfill({ status: 500, body: '' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Chưa có tài khoản? Đăng ký' }).click();
  await page.getByRole('textbox', { name: 'Họ và tên' }).fill('Nguyễn Văn A');
  await page.getByRole('textbox', { name: 'Email' }).fill('old@example.test');
  await page.getByRole('textbox', { name: 'Username' }).fill('nguyen.van.a');
  await page.getByLabel('Mật khẩu mới').fill('StrongPassword12!');
  await page.getByLabel('Xác nhận mật khẩu').fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Gửi mã xác minh' }).click();
  await expect(page.getByText(/Email này đã được đăng ký/)).toBeVisible();
  expect(verificationCalls).toBe(0);
});

test('profile update sends the current ETag and preserves omitted fields', async ({ page }) => {
  const requests: { etag: string | null; body: unknown }[] = [];
  const account = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'trainee@example.test',
    fullName: 'Nguyễn Văn A',
    username: 'nguyen.a',
    role: 'Trainee',
    organizationId: null,
    profileRevision: 2,
    emailVerifiedAt: '2026-10-01T00:00:00Z',
  };
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'access', refreshToken: 'refresh', user: account }),
    });
  });
  await page.route('**/api/me/avatar', async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/problem+json', body: '{}' });
  });
  await page.route('**/api/auth/me', async (route) => {
    if (route.request().method() === 'PATCH') {
      requests.push({
        etag: route.request().headers()['if-match'] ?? null,
        body: route.request().postDataJSON(),
      });
      account.fullName = 'Nguyễn Văn B';
      account.profileRevision = 3;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ETag: `"${account.profileRevision}"` },
      body: JSON.stringify(account),
    });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Mở tài khoản' }).click();
  await page.getByRole('button', { name: 'Cài đặt tài khoản' }).click();
  await page.getByRole('textbox', { name: 'Sửa họ và tên' }).fill('Nguyễn Văn B');
  await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
  await expect(page.getByText('Đã cập nhật hồ sơ.')).toBeVisible();
  expect(requests).toEqual([
    {
      etag: '"2"',
      body: {
        fullName: 'Nguyễn Văn B',
        username: 'nguyen.a',
        dob: null,
        gender: null,
        phoneNumber: null,
      },
    },
  ]);
});

test('forgot password sends a normalized email', async ({ page }) => {
  const submitted: unknown[] = [];
  await page.route('**/api/auth/forgot-password', async (route) => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, body: '' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Quên mật khẩu?' }).click();
  await page.getByRole('textbox', { name: 'Email đặt lại mật khẩu' }).fill('TEST@EXAMPLE.COM');
  await page.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(page.getByText(/hệ thống đã nhận yêu cầu/)).toBeVisible();
  expect(submitted).toEqual([{ email: 'test@example.com' }]);
});

test('legacy verification and password reset links remain usable', async ({ page }) => {
  const token = 'a'.repeat(64);
  const submitted: unknown[] = [];
  await page.route('**/api/auth/verify-email', async (route) => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/auth/reset-password', async (route) => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({ status: 204, body: '' });
  });
  await page.goto(`/verify-email?token=${token}`);
  await page.getByRole('button', { name: 'Xác minh email', exact: true }).click();
  await expect(page.getByText(/Email đã được xác minh/)).toBeVisible();
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('NewStrongPassword12!');
  await page.getByLabel('Xác nhận mật khẩu mới').fill('NewStrongPassword12!');
  await page.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await expect(page.getByText(/Đã đặt lại mật khẩu/)).toBeVisible();
  expect(submitted).toEqual([{ token }, { token, newPassword: 'NewStrongPassword12!' }]);
});
