import test from 'node:test';
import assert from 'node:assert/strict';
import { queueFixture, native, queue } from '../support/queue-fixture.mjs';
import { preparedPackage } from '../support/training-fixture.mjs';
import '../support/fakes/expo-file-system.mjs';
const api = await import('../../src/api/training.ts');
test('verified package is recorded before handing its path to Unity', async (t) => {
  await queueFixture(t);
  const f = preparedPackage();
  f.pkg.seed(globalThis.__fs);
  const original = native.launch;
  t.after(() => {
    native.launch = original;
    globalThis.__fs.reset();
  });
  native.launch = async (payload) => {
    assert.equal((await queue.getLaunch(f.session.id)).account_id, 'owner');
    await original.call(native, payload);
  };
  await api.launchStartedSession(f.started, f.pkg.manifestPath, 7, 'owner');
  assert.deepEqual(native.launches[0], {
    protocolVersion: '1',
    sessionId: f.session.id,
    kind: 'Training',
    mode: 'Assessment',
    runtimeVersion: '2.5.0',
    manifestPath: f.pkg.manifestPath,
    resumeFromSequence: 7,
    locale: 'vi',
  });
  assert.equal('accessToken' in native.launches[0], false);
});
test('missing package prevents both launch persistence and native call', async (t) => {
  await queueFixture(t);
  globalThis.__fs.reset();
  const f = preparedPackage();
  await assert.rejects(api.launchStartedSession(f.started, f.pkg.manifestPath, 0, 'owner'));
  assert.equal(await queue.getLaunch(f.session.id), null);
  assert.equal(native.launches.length, 0);
});
test('native failure preserves the pending launch for recovery', async (t) => {
  await queueFixture(t);
  const f = preparedPackage();
  f.pkg.seed(globalThis.__fs);
  const original = native.launch;
  t.after(() => {
    native.launch = original;
    globalThis.__fs.reset();
  });
  native.launch = async () => {
    throw Error('bridge down');
  };
  await assert.rejects(
    api.launchStartedSession(f.started, f.pkg.manifestPath, 0, 'owner'),
    /bridge down/,
  );
  assert.equal((await queue.getLaunch(f.session.id)).state, 'pending');
});
