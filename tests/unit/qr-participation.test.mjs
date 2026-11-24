import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../src/api/qr.ts';
import { mockBackend } from '../support/http.mjs';
import { ApiError } from '../../src/api/types/common.ts';
test('resolving QR retains expired service flags and makes no join request', async (t) => {
  const resolution = {
    buildingId: 'b',
    hasAccess: false,
    serviceStatus: 'Expired',
    canStartNewSessions: false,
  };
  const calls = mockBackend(t, async () => resolution);
  assert.equal(await api.resolveBuildingQr('a/b ?'), resolution);
  assert.deepEqual(calls, [{ path: '/api/qr/a%2Fb%20%3F', options: {} }]);
});
test('training listing preserves pinned version and modes; participation sends code only to explicit verification', async (t) => {
  const trainings = [
    {
      id: 't',
      releaseId: 'r',
      scenarioVersionId: 'v',
      allowedModes: ['Guided', 'Assessment'],
      reviewStatus: 'Approved',
    },
  ];
  const calls = mockBackend(t, async (path) =>
    path.endsWith('/trainings') ? trainings : undefined,
  );
  assert.equal(await api.getQrTrainings('qr/token'), trainings);
  await api.verifyParticipationCode('building/id', '001234');
  assert.equal(calls[0].path, '/api/qr/qr%2Ftoken/trainings');
  assert.deepEqual(calls[1], {
    path: '/api/buildings/building%2Fid/participation/verify',
    options: { json: { code: '001234' } },
  });
});
test('denied participation propagates backend problem without success fallback', async (t) => {
  const issue = new ApiError('invalid code', 403, { code: 'PARTICIPATION_CODE_INVALID' });
  mockBackend(t, async () => {
    throw issue;
  });
  await assert.rejects(api.verifyParticipationCode('b', 'bad'), (e) => e === issue);
});
