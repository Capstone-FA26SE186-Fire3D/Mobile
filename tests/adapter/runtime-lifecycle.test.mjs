import test from 'node:test';
import assert from 'node:assert/strict';
import { queueFixture, native } from '../support/queue-fixture.mjs';
import { appListeners, emitAppState } from '../support/fakes/react-native.mjs';
import { mockBackend } from '../support/http.mjs';
const runtime = await import('../../src/features/training/training-runtime.ts');
test('each start handle disposes its listeners and foreground ingests journal', async (t) => {
  await queueFixture(t);
  mockBackend(t, async () => {
    throw Error('no API calls expected');
  });
  const observed = [];
  const off = runtime.subscribeTrainingRuntime((e) => observed.push(e));
  t.after(off);
  const stop1 = runtime.startTrainingRuntime({ accountId: 'owner', role: 'Trainee' }),
    stop2 = runtime.startTrainingRuntime({ accountId: 'owner', role: 'Trainee' });
  await runtime.pumpTrainingRuntime();
  assert.equal(appListeners.size, 2);
  assert.equal(native.listeners.size, 2);
  native.push({ type: 'Exited', sessionId: null, payload: {} });
  emitAppState('active');
  await runtime.pumpTrainingRuntime();
  assert.ok(observed.some((e) => e.kind === 'unity' && e.message.type === 'Exited'));
  stop1();
  assert.equal(appListeners.size, 1);
  stop2();
  assert.equal(appListeners.size, 0);
  assert.equal(native.listeners.size, 0);
});
test('Ready with a different embedded runtime emits mismatch and original callback', async (t) => {
  await queueFixture(t);
  const observed = [];
  const off = runtime.subscribeTrainingRuntime((e) => observed.push(e));
  t.after(off);
  native.push({
    type: 'Ready',
    sessionId: null,
    payload: { runtimeVersion: '9.0.0', protocolVersion: '1' },
  });
  await runtime.pumpTrainingRuntime();
  assert.ok(observed.some((e) => e.kind === 'runtime-mismatch'));
  assert.ok(observed.some((e) => e.kind === 'unity'));
});
