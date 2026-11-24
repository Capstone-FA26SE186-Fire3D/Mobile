import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockBackend } from '../support/http.mjs';
import { prepared, started } from '../support/training-fixture.mjs';
import { control, getItemAsync } from '../support/fakes/expo-secure-store.mjs';
const api = await import('../../src/api/training.ts');
beforeEach(() => control.reset());
test('expired replay rotates once and stores only the validated continuation', async (t) => {
  const p = prepared();
  let calls = 0,
    rotations = 0;
  const requests = mockBackend(t, async () => {
    const response = started(p);
    if (++calls === 1) response.launch.expiresAt = '2000-01-01T00:00:00Z';
    return response;
  });
  const result = await api.startTrainingSession(p, 'old', async () => {
    rotations++;
    return 'fresh';
  });
  assert.equal(rotations, 1);
  assert.deepEqual(
    requests.map((r) => r.options.headers['Idempotency-Key']),
    ['old', 'fresh'],
  );
  assert.equal(await getItemAsync('fire3d.continuation.' + p.id), result.continuation.token);
});
for (const field of ['releaseId', 'buildingId', 'scenarioVersionId', 'mode', 'runtimeVersion'])
  test('refuse start changed ' + field, async (t) => {
    const p = prepared();
    const response = started(p);
    response.session[field] = 'foreign';
    mockBackend(t, async () => response);
    await assert.rejects(
      api.startTrainingSession(p, 'key', async () => {
        throw Error('unexpected rotation');
      }),
      /không khớp/,
    );
    assert.equal(await getItemAsync('fire3d.continuation.' + p.id), null);
  });
test('offline start cannot use cache or continuation as authority', async (t) => {
  const p = prepared();
  mockBackend(t, async () => {
    throw new TypeError('offline');
  });
  await assert.rejects(
    api.startTrainingSession(p, 'k', async () => {
      throw Error('unexpected');
    }),
    /offline/,
  );
  assert.equal(await getItemAsync('fire3d.continuation.' + p.id), null);
});
