import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGoogleExchange,
  traineeUsername,
  exchangeFirebaseToken,
  completeGoogleTrainee,
  linkGoogleAccount,
} from '../src/api/google.contract.ts';
import { base64Url } from '../src/services/device-identity.ts';
import { putDeviceBinding, deleteDeviceBinding } from '../src/services/device-api.ts';
import { parseQrToken } from '../src/features/qr/qr-token.ts';
import { validatePackageManifest } from '../src/features/training/package-contract.ts';

test('QR accepts only the published URL shape or a bare 43-character token', () => {
  const token = 'a'.repeat(43);
  assert.equal(parseQrToken(token), token);
  assert.equal(parseQrToken(`https://fet3d.io.vn/qr/${token}`), token);
  assert.equal(parseQrToken(`https://fet3d.io.vn/qr/${token}/`), token);
  assert.equal(parseQrToken(`http://fet3d.io.vn/qr/${token}`), null);
  assert.equal(parseQrToken(`https://fet3d.io.vn/qr/${token}?redirect=other`), null);
  assert.equal(parseQrToken(`https://fet3d.io.vn/other/${token}`), null);
  assert.equal(parseQrToken('a'.repeat(42)), null);
});

test('Unity package manifest pins provenance and rejects path traversal', () => {
  const pin = {
    releaseId: 'release',
    manifestHash: 'a'.repeat(64),
    buildingId: 'building',
    revisionId: 'revision',
    runtimeVersion: '2.0.0',
    materialLibraryVersion: '1',
  };
  const manifest = {
    schemaVersion: 'fet3d.package/1',
    runtimeVersion: '2.0.0',
    buildTarget: 'Android',
    unityVersion: '6000',
    materialLibraryVersion: '1',
    buildingId: 'building',
    revisionId: 'revision',
    metadata: 'metadata.json',
    scenario: 'scenario.json',
    floors: [{ floorId: 'L1', bundle: 'floor.bundle', scene: 'Scene' }],
    files: [
      { path: 'metadata.json', sha256: 'b'.repeat(64), size: 1 },
      { path: 'scenario.json', sha256: 'c'.repeat(64), size: 1 },
      { path: 'floor.bundle', sha256: 'd'.repeat(64), size: 1 },
    ],
  };
  assert.equal(validatePackageManifest(manifest, pin), manifest);
  assert.throws(() => validatePackageManifest({ ...manifest, runtimeVersion: '1.0.0' }, pin));
  assert.throws(() =>
    validatePackageManifest(
      { ...manifest, files: [{ path: 'floor/..', sha256: 'b'.repeat(64), size: 1 }] },
      pin,
    ),
  );
});

test('Google exchange accepts only an authenticated Trainee session', () => {
  const authentication = {
    accessToken: 'access',
    refreshToken: 'refresh',
    user: { id: 'user', email: 'user@example.test', role: 'Trainee' },
  };
  assert.deepEqual(parseGoogleExchange({ status: 'Authenticated', authentication }), {
    status: 'Authenticated',
    authentication,
  });
  assert.throws(() =>
    parseGoogleExchange({
      status: 'Authenticated',
      authentication: {
        ...authentication,
        user: { ...authentication.user, role: 'PlatformAdmin' },
      },
    }),
  );
  assert.throws(() =>
    parseGoogleExchange({
      status: 'Authenticated',
      authentication: { ...authentication, refreshToken: '' },
    }),
  );
});

test('Google onboarding requires a proof and a valid Trainee username', () => {
  assert.deepEqual(
    parseGoogleExchange({ status: 'OnboardingRequired', onboardingToken: 'proof' }),
    { status: 'OnboardingRequired', onboardingToken: 'proof' },
  );
  assert.throws(() => parseGoogleExchange({ status: 'OnboardingRequired' }));
  assert.equal(traineeUsername('  Trainee_01 '), 'trainee_01');
  assert.throws(() => traineeUsername('invalid username'));
});

test('Google exchange, onboarding and explicit link use deployed API shapes', async () => {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    if (path.endsWith('login-firebase'))
      return { status: 'OnboardingRequired', onboardingToken: 'proof' };
    if (path.endsWith('onboarding/complete'))
      return {
        status: 'Authenticated',
        authentication: {
          accessToken: 'access',
          refreshToken: 'refresh',
          user: { id: 'user', email: 'user@example.test', role: 'Trainee' },
        },
      };
    return { requiresLogin: true };
  };
  assert.equal((await exchangeFirebaseToken(request, 'firebase-token')).onboardingToken, 'proof');
  assert.equal(
    (await completeGoogleTrainee(request, 'proof', ' TRAINEE_01 ')).status,
    'Authenticated',
  );
  assert.deepEqual(await linkGoogleAccount(request, 'firebase-token', 'password'), {
    requiresLogin: true,
  });
  assert.deepEqual(
    calls.map(({ path, options }) => [path, options.json]),
    [
      ['/api/auth/login-firebase', 'firebase-token'],
      [
        '/api/auth/google/onboarding/complete',
        { onboardingToken: 'proof', accountType: 'trainee', username: 'trainee_01' },
      ],
      ['/api/me/link-google', { idToken: 'firebase-token', currentPassword: 'password' }],
    ],
  );
});

test('installation secret is canonical base64url for 32 random bytes', () => {
  const encoded = base64Url(Uint8Array.from({ length: 32 }, (_, index) => index));
  assert.equal(encoded, 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
  assert.equal(encoded.length, 43);
  assert.deepEqual(
    Buffer.from(encoded, 'base64url'),
    Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index)),
  );
});

test('FCM binding and revoke use the installation proof and fail closed on revoke error', async () => {
  const calls = [];
  const installation = {
    deviceUuid: '11111111-1111-4111-8111-111111111111',
    installationKey: 'A'.repeat(43),
  };
  const request = async (path, options) => {
    calls.push({ path, options });
  };
  await putDeviceBinding(request, installation, 'native-fcm-token', '35', '1.2.3');
  await deleteDeviceBinding(request, installation);
  assert.deepEqual(calls, [
    {
      path: '/api/auth/devices',
      options: {
        method: 'PUT',
        headers: { 'X-Installation-Key': installation.installationKey },
        json: {
          deviceUuid: installation.deviceUuid,
          fcmToken: 'native-fcm-token',
          osVersion: '35',
          appVersion: '1.2.3',
        },
      },
    },
    {
      path: `/api/auth/devices/${installation.deviceUuid}`,
      options: {
        method: 'DELETE',
        headers: { 'X-Installation-Key': installation.installationKey },
      },
    },
  ]);
  await assert.rejects(
    () =>
      deleteDeviceBinding(async () => {
        throw new Error('offline');
      }, installation),
    /offline/,
  );
  await assert.rejects(
    () => putDeviceBinding(request, installation, 'not a token', '35', '1.2.3'),
    /FCM device token/,
  );
});

test('runtime 2.0.1 app plays packages that need 2.0.0, not newer ones, and Ready must match the app', async () => {
  const { APP_RUNTIME_VERSION, checkUnityRuntime } =
    await import('../src/features/training/runtime-version.ts');
  assert.equal(APP_RUNTIME_VERSION, '2.0.1');
  const pin = {
    releaseId: 'release',
    manifestHash: 'a'.repeat(64),
    buildingId: 'building',
    revisionId: 'revision',
    runtimeVersion: APP_RUNTIME_VERSION,
    materialLibraryVersion: '1',
  };
  const manifest = {
    schemaVersion: 'fet3d.package/1',
    protocolVersion: '1',
    manifestSchemaVersion: '1',
    runtimeVersion: '2.0.0',
    minRuntimeVersion: '2.0.0',
    buildTarget: 'Android',
    unityVersion: '6000',
    materialLibraryVersion: '1',
    revisionId: 'revision',
    floors: [{ bundle: 'floor.bundle', scene: 'Scene' }],
    files: [{ path: 'floor.bundle', sha256: 'd'.repeat(64), size: 1 }],
  };
  assert.equal(validatePackageManifest(manifest, pin), manifest);
  assert.throws(() => validatePackageManifest({ ...manifest, minRuntimeVersion: '2.1.0' }, pin));
  assert.throws(() => validatePackageManifest({ ...manifest, protocolVersion: '2' }, pin));
  assert.equal(checkUnityRuntime({ runtimeVersion: '2.0.1', protocolVersion: '1' }), null);
  assert.match(checkUnityRuntime({ runtimeVersion: '2.0.0', protocolVersion: '1' }), /2\.0\.0/);
});
