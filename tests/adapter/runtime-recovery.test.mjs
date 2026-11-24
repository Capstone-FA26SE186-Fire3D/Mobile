import test from 'node:test';
import assert from 'node:assert/strict';
import { queueFixture, queue, launch, events } from '../support/queue-fixture.mjs';
import { mockBackend } from '../support/http.mjs';
const runtime = await import('../../src/features/training/training-runtime.ts');
const { ApiError } = await import('../../src/api/types/common.ts');
test('terminal heartbeat response stops further heartbeats', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1800000000000 });
  await queueFixture(t);
  await launch('heartbeat', 'Training', 'owner', 'launched');
  const calls = mockBackend(t, async () => {
    throw new ApiError('gone', 404);
  });
  const stop = runtime.startTrainingRuntime({ accountId: 'owner', role: 'Trainee' });
  t.after(stop);
  await runtime.pumpTrainingRuntime();
  t.mock.timers.tick(60000);
  await runtime.pumpTrainingRuntime();
  assert.equal(calls.length, 1);
});
test('retry timer uses five-second first delay and cleanup removes it', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1800000000000 });
  await queueFixture(t);
  await launch('retry');
  await events('retry');
  const calls = mockBackend(t, async () => {
    throw Error('offline');
  });
  const stop = runtime.startTrainingRuntime({ accountId: 'owner', role: 'Trainee' });
  // Calling pump while startup is active requests another pass; capture the settled count.
  await runtime.pumpTrainingRuntime();
  const initial = calls.length;
  t.mock.timers.tick(4999);
  assert.equal(calls.length, initial);
  t.mock.timers.tick(1);
  await runtime.pumpTrainingRuntime();
  assert.ok(calls.length > initial);
  stop();
  const end = calls.length;
  t.mock.timers.tick(300000);
  assert.equal(calls.length, end);
});
test('expired launched session absent from Unity completes Abandoned', async (t) => {
  await queueFixture(t);
  await queue.saveLaunch('gone', 'Training', 1, '2000-01-01T00:00:00Z', '/m', 'owner');
  await queue.markLaunched(-1, 'gone');
  const calls = mockBackend(t, async () => ({ status: 'Completed', missingRanges: [] }));
  const stop = runtime.startTrainingRuntime({ accountId: 'owner', role: 'Trainee' });
  t.after(stop);
  await runtime.pumpTrainingRuntime();
  const completion = calls.find((c) => c.path.endsWith('/complete'));
  assert.equal(completion.options.json.endReason, 'Abandoned');
  assert.equal((await queue.completionFor('gone')).state, 'completed');
});
