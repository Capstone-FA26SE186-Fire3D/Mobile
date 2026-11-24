import test from 'node:test';
import assert from 'node:assert/strict';
import { authFixture, mockFetch, json, session } from '../support/http.mjs';
import { getItemAsync } from 'expo-secure-store';
const { parseGoogleExchange, traineeUsername } = await import('../../src/api/google.contract.ts');
for (const role of ['PlatformAdmin', 'FireSafetyExpert', 'Unknown', 'OrganizationUser'])
  test('Google exchange rejects role ' + role, () => {
    assert.throws(() =>
      parseGoogleExchange({
        status: 'Authenticated',
        authentication: session({ user: { id: 'x', email: 'a', role } }),
      }),
    );
  });
for (const value of [
  null,
  {},
  { status: 'OnboardingRequired', onboardingToken: '' },
  { status: 'Authenticated', authentication: {} },
])
  test('malformed exchange has no authenticated result: ' + JSON.stringify(value), () =>
    assert.throws(() => parseGoogleExchange(value)),
  );
test('password login rejects expert without persisting credentials', async (t) => {
  const auth = await authFixture(t);
  mockFetch(t, () =>
    json(
      200,
      session({ user: { id: 'expert', email: 'expert@example.test', role: 'FireSafetyExpert' } }),
    ),
  );
  await assert.rejects(auth.loginWithPassword('a', 'b'));
  assert.equal(await getItemAsync('fire3d.auth.session.v1'), null);
});
test('username boundaries normalize valid input and reject outside 3 to 30', () => {
  assert.equal(traineeUsername(' A.B '), 'a.b');
  assert.equal(traineeUsername('a'.repeat(30)), 'a'.repeat(30));
  for (const value of ['ab', 'a'.repeat(31), 'a b', 'học'])
    assert.throws(() => traineeUsername(value));
});
