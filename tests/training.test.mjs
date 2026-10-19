import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePackageManifest } from '../src/features/training/package-contract.ts';
import { APP_RUNTIME_VERSION } from '../src/features/training/runtime-version.ts';
import {
  allowedTrainingModes,
  assertStartMatchesPrepare,
  crossCheckManifest,
  describeTrainingProblem,
  formatBytes,
  looksLikeExpiredUrl,
  pinFromSession,
  planPackageDownload,
  retryDelayMs,
  urlsExpireSoon,
} from '../src/features/training/session-contract.ts';

const hash = (char) => char.repeat(64);
const now = Date.parse('2026-10-19T08:00:00Z');
const releaseId = '33333333-3333-4333-8333-333333333333';

function preparedSession(overrides = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    status: 'Prepared',
    trainingId: 'training-1',
    releaseId,
    scenarioVersionId: '55555555-5555-4555-8555-555555555555',
    buildingId: '11111111-1111-4111-8111-111111111111',
    mode: 'Assessment',
    runtimeVersion: APP_RUNTIME_VERSION,
    scenarioHash: hash('9'),
    rubricHash: hash('8'),
    package: { packageHash: hash('a'), manifestHash: hash('b'), buildTarget: 'Android' },
    expiresAt: '2026-10-20T08:00:00Z',
    hasResult: false,
    ...overrides,
  };
}

function packageResponse(overrides = {}) {
  return {
    schemaVersion: 'fet3d.package/1',
    manifest: {
      url: 'https://s3.example.test/p/manifest.json?sig=1',
      sha256: hash('b'),
      sizeBytes: 900,
    },
    files: [
      {
        path: 'floors/L1.bundle',
        url: 'https://s3.example.test/p/floors/L1.bundle?sig=1',
        sha256: hash('c'),
        sizeBytes: 1000,
      },
      {
        path: 'building_metadata.json',
        url: 'https://s3.example.test/p/building_metadata.json?sig=1',
        sha256: hash('d'),
        sizeBytes: 100,
      },
      {
        path: 'scenario.json',
        url: 'https://s3.example.test/p/scenario.json?sig=1',
        sha256: hash('e'),
        sizeBytes: 50,
      },
    ],
    floors: [{ id: 'L1', bundle: 'floors/L1.bundle' }],
    runtimeVersion: '2.0.0',
    buildTarget: 'Android',
    expiresAt: '2026-10-19T08:10:00Z',
    ...overrides,
  };
}

/** Shape written by the Unity build worker (Unity ContentManifest): floors[].id, no buildingId. */
function unityManifest(overrides = {}) {
  return {
    schemaVersion: 'fet3d.package/1',
    jobId: '66666666-6666-4666-8666-666666666666',
    buildTarget: 'Android',
    protocolVersion: '1',
    manifestSchemaVersion: '1',
    runtimeVersion: '2.0.0',
    minRuntimeVersion: '2.0.0',
    requiredCapabilities: ['fire.v1'],
    unityVersion: '6000.6.6f1',
    materialLibraryVersion: 'lib-3',
    revisionId: 'rev-7',
    lightingScenarios: ['normal', 'outage'],
    floors: [{ id: 'L1', bundle: 'floors/L1.bundle', scene: 'L1', elevation: 0 }],
    files: [
      { path: 'floors/L1.bundle', sha256: hash('c'), size: 1000 },
      { path: 'building_metadata.json', sha256: hash('d'), size: 100 },
      { path: 'scenario.json', sha256: hash('e'), size: 50 },
    ],
    metadata: 'building_metadata.json',
    scenario: 'scenario.json',
    ...overrides,
  };
}

test('training modes keep BE order and drop unknown values', () => {
  assert.deepEqual(allowedTrainingModes(['Assessment', 'Learn', 'Sprint']), [
    'Learn',
    'Assessment',
  ]);
  assert.deepEqual(allowedTrainingModes(null), []);
});

test('pin comes only from a prepared or running session with a complete Android pin', () => {
  const pin = pinFromSession(preparedSession());
  assert.deepEqual(pin, {
    releaseId,
    manifestHash: hash('b'),
    buildingId: '11111111-1111-4111-8111-111111111111',
    revisionId: null,
    runtimeVersion: APP_RUNTIME_VERSION,
    materialLibraryVersion: null,
  });
  assert.throws(() => pinFromSession(preparedSession({ status: 'Expired' })), /Prepared/);
  assert.throws(() => pinFromSession(preparedSession({ runtimeVersion: '1.4.0' })), /runtime/);
  assert.throws(() =>
    pinFromSession(preparedSession({ package: { packageHash: hash('a'), manifestHash: null } })),
  );
  assert.throws(() =>
    pinFromSession(
      preparedSession({
        package: { packageHash: hash('a'), manifestHash: hash('b'), buildTarget: 'iOS' },
      }),
    ),
  );
});

test('package download adapter checks the pin, HTTPS, paths and expiry', () => {
  const pin = pinFromSession(preparedSession());
  const plan = planPackageDownload(pin, packageResponse(), now);
  assert.equal(plan.fileCount, 3);
  assert.equal(plan.totalBytes, 900 + 1000 + 100 + 50);
  assert.equal(plan.files['scenario.json'].sha256, hash('e'));
  assert.equal(plan.expiresAt, Date.parse('2026-10-19T08:10:00Z'));
  assert.equal(urlsExpireSoon(plan, now), false);
  assert.equal(urlsExpireSoon(plan, Date.parse('2026-10-19T08:09:30Z')), true);

  assert.throws(
    () =>
      planPackageDownload(
        pin,
        packageResponse({ manifest: { ...packageResponse().manifest, sha256: hash('f') } }),
        now,
      ),
    /không khớp manifest/,
  );
  assert.throws(() => planPackageDownload(pin, packageResponse({ schemaVersion: 'legacy' }), now));
  assert.throws(() => planPackageDownload(pin, packageResponse({ buildTarget: 'iOS' }), now));
  assert.throws(() => planPackageDownload(pin, packageResponse({ runtimeVersion: '3.0.0' }), now));
  assert.throws(
    () => planPackageDownload(pin, packageResponse({ expiresAt: '2026-10-19T07:59:00Z' }), now),
    /hết hạn/,
  );
  const files = packageResponse().files;
  assert.throws(() =>
    planPackageDownload(
      pin,
      packageResponse({ files: [{ ...files[0], url: 'http://s3.example.test/x' }] }),
      now,
    ),
  );
  assert.throws(() =>
    planPackageDownload(pin, packageResponse({ files: [files[0], files[0]] }), now),
  );
  assert.throws(() =>
    planPackageDownload(
      pin,
      packageResponse({ files: [{ ...files[0], path: 'floors/../../etc' }] }),
      now,
    ),
  );
  const proto = planPackageDownload(
    pin,
    packageResponse({ files: [{ ...files[0], path: '__proto__' }] }),
    now,
  );
  assert.equal(Object.hasOwn(proto.files, '__proto__'), true);
});

test('Unity worker manifest validates against a BE pin without revision or material library', () => {
  const pin = pinFromSession(preparedSession());
  const manifest = unityManifest();
  assert.equal(validatePackageManifest(manifest, pin), manifest);
  assert.throws(
    () => validatePackageManifest(unityManifest({ minRuntimeVersion: '2.1.0' }), pin),
    /runtime/,
  );
  assert.throws(() => validatePackageManifest(unityManifest({ protocolVersion: '2' }), pin));
  assert.throws(() => validatePackageManifest(unityManifest({ metadata: 'missing.json' }), pin));
  assert.throws(
    () => validatePackageManifest(unityManifest({ buildingId: 'another' }), pin),
    /provenance/,
  );
  assert.throws(() => validatePackageManifest(unityManifest(), { ...pin, revisionId: 'rev-8' }));
  assert.throws(() =>
    validatePackageManifest(unityManifest(), { ...pin, materialLibraryVersion: 'lib-2' }),
  );
  assert.throws(() =>
    validatePackageManifest(
      unityManifest({ files: [{ path: 'floors/L1.bundle', sha256: hash('c'), size: 0 }] }),
      pin,
    ),
  );
});

test('verified manifest and signed URL list must describe the same files', () => {
  const pin = pinFromSession(preparedSession());
  const plan = planPackageDownload(pin, packageResponse(), now);
  crossCheckManifest(unityManifest(), plan);
  const files = unityManifest().files;
  assert.throws(
    () =>
      crossCheckManifest(
        unityManifest({ files: [{ ...files[0], sha256: hash('0') }, files[1], files[2]] }),
        plan,
      ),
    /SHA-256/,
  );
  assert.throws(
    () => crossCheckManifest(unityManifest({ files: [files[0], files[1]] }), plan),
    /số file/,
  );
  assert.throws(
    () =>
      crossCheckManifest(
        unityManifest({ files: [files[0], files[1], { ...files[2], path: 'other.json' }] }),
        plan,
      ),
    /URL/,
  );
});

test('online start must return the prepared package and a live grant', () => {
  const prepared = preparedSession();
  const started = {
    session: { ...prepared, status: 'Launching' },
    launch: {
      sessionId: prepared.id,
      generation: 1,
      expiresAt: '2026-10-19T08:05:00Z',
      launchGrant: 'grant',
    },
    continuation: { token: 'continuation', expiresAt: '2026-10-26T08:00:00Z' },
  };
  assertStartMatchesPrepare(prepared, started, now);
  assert.throws(
    () =>
      assertStartMatchesPrepare(
        prepared,
        {
          ...started,
          session: {
            ...started.session,
            package: { ...prepared.package, manifestHash: hash('f') },
          },
        },
        now,
      ),
    /không khớp/,
  );
  assert.throws(() =>
    assertStartMatchesPrepare(
      prepared,
      { ...started, session: { ...started.session, mode: 'Learn' } },
      now,
    ),
  );
  assert.throws(
    () =>
      assertStartMatchesPrepare(
        prepared,
        { ...started, launch: { ...started.launch, expiresAt: '2026-10-19T07:00:00Z' } },
        now,
      ),
    /hết hạn/,
  );
  assert.throws(() => assertStartMatchesPrepare(prepared, { ...started, continuation: null }, now));
});

test('retry, expiry detection and labels', () => {
  assert.deepEqual([0, 1, 2, 10, 50].map(retryDelayMs), [5000, 10000, 20000, 300000, 300000]);
  assert.equal(looksLikeExpiredUrl(new Error('Unable to download file: 403 Forbidden')), true);
  assert.equal(looksLikeExpiredUrl(new Error('Request has expired')), true);
  assert.equal(looksLikeExpiredUrl(new Error('Network request failed')), false);
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(12.3 * 1024 * 1024), '12,3 MB');
  assert.equal(formatBytes(1.05 * 1024 ** 3), '1,05 GB');
  assert.match(describeTrainingProblem('LEARNER_LIMIT_REACHED', 409, 'x'), /hết suất/);
  assert.equal(describeTrainingProblem('UNKNOWN', 500, 'fallback'), 'fallback');
});
