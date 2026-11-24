import test from 'node:test';
import assert from 'node:assert/strict';
import { authFixture, mockFetch, json, user } from '../support/http.mjs';
import { getItemAsync } from 'expo-secure-store';
test('OTP verification returns proof and registration does not log in', async (t) => {
  const auth = await authFixture(t);
  const calls = mockFetch(t, (c) =>
    c.url.pathname.endsWith('/verify-otp')
      ? json(200, { registrationToken: 'proof', expiresAt: '2026-12-01T00:00:00Z' })
      : c.url.pathname.endsWith('/trainee')
        ? json(200, user)
        : json(204),
  );
  await auth.requestRegistrationOtp('a@example.test');
  assert.equal(
    (await auth.verifyRegistrationOtp('a@example.test', '012345')).registrationToken,
    'proof',
  );
  const input = {
    email: 'a@example.test',
    username: 'learner',
    password: 'pass',
    confirmPassword: 'pass',
    registrationToken: 'proof',
    fullName: 'Learner',
    dob: null,
    gender: null,
    phoneNumber: null,
  };
  assert.deepEqual(await auth.registerTrainee(input), user);
  assert.deepEqual(
    calls.map((c) => JSON.parse(c.body)),
    [{ email: 'a@example.test' }, { email: 'a@example.test', otp: '012345' }, input],
  );
  assert.equal(await getItemAsync('fire3d.auth.session.v1'), null);
});
test('registration refuses non-trainee response', async (t) => {
  const auth = await authFixture(t);
  mockFetch(t, () => json(200, { ...user, role: 'OrganizationUser' }));
  await assert.rejects(auth.registerTrainee({ registrationToken: 'p' }), /không hợp lệ/);
});
test('reset and verification send explicit proofs without creating a session', async (t) => {
  const auth = await authFixture(t);
  const calls = mockFetch(t, () => json(204));
  await auth.requestPasswordReset('mail');
  await auth.resetPassword('reset-proof', 'new');
  await auth.resendVerification('mail');
  await auth.verifyEmail('verify-proof');
  assert.deepEqual(
    calls.map((c) => [c.url.pathname, JSON.parse(c.body)]),
    [
      ['/api/auth/forgot-password', { email: 'mail' }],
      ['/api/auth/reset-password', { token: 'reset-proof', newPassword: 'new' }],
      ['/api/auth/resend-verification', { email: 'mail' }],
      ['/api/auth/verify-email', { token: 'verify-proof' }],
    ],
  );
});
