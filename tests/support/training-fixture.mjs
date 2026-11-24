import { buildPackage } from './package-fixture.mjs';
export function prepared(overrides = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    status: 'Prepared',
    trainingId: 'training-1',
    releaseId: '33333333-3333-4333-8333-333333333333',
    scenarioVersionId: '55555555-5555-4555-8555-555555555555',
    buildingId: '11111111-1111-4111-8111-111111111111',
    mode: 'Assessment',
    runtimeVersion: '2.5.0',
    scenarioHash: '9'.repeat(64),
    rubricHash: '8'.repeat(64),
    package: { packageHash: 'a'.repeat(64), manifestHash: 'b'.repeat(64), buildTarget: 'Android' },
    hasResult: false,
    ...overrides,
  };
}
export function started(source = prepared()) {
  return {
    session: { ...source, status: 'Launching' },
    launch: {
      sessionId: source.id,
      generation: 1,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      launchGrant: 'short-grant',
    },
    continuation: {
      token: 'continuation-test',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  };
}
export function preparedPackage() {
  const pkg = buildPackage();
  const session = prepared({
    package: {
      packageHash: 'a'.repeat(64),
      manifestHash: pkg.manifestHash,
      buildTarget: 'Android',
    },
  });
  return { pkg, session, started: started(session) };
}
