import { nativeFixture, event } from './unity.mjs';
import { sqliteFor, control } from './fakes/expo-sqlite.mjs';
export const native = (globalThis.__unityNative = nativeFixture());
export const queue = await import('../../src/features/training/event-queue.native.ts');
export const db = () => sqliteFor('fire3d-training-queue.db');
export async function queueFixture(t) {
  control.before = null;
  native.reset();
  await queue.pendingEvents('initialize');
  db().exec(
    'DELETE FROM bridge_messages; DELETE FROM unity_events; DELETE FROM session_completions; DELETE FROM session_launches;',
  );
  t.after(() => {
    control.before = null;
    native.reset();
  });
}
export async function launch(id = 's1', kind = 'Training', owner = 'owner', state = 'pending') {
  await queue.saveLaunch(
    id,
    kind,
    1,
    new Date(Date.now() + 300000).toISOString(),
    '/manifest',
    owner,
  );
  if (state === 'launched') await queue.markLaunched(-1, id);
}
export async function events(id = 's1', count = 1) {
  native.push({
    type: 'Events',
    sessionId: id,
    payload: Array.from({ length: count }, (_, i) => event(i + 1)),
  });
  await queue.ingestUnityCallbacks();
}
export async function completed(id = 's1', last = 1) {
  native.push({
    type: 'Completed',
    sessionId: id,
    payload: { lastEventSequence: last, endReason: 'Finished' },
  });
  await queue.ingestUnityCallbacks();
}
export { event };
