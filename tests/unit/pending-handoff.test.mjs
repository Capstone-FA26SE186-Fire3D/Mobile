import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readPendingHandoff,
  writePendingHandoff,
  validHandoffCode,
} from '../../src/features/playtest/pending-handoff.ts';
import { control, setItemAsync, getItemAsync } from '../support/fakes/expo-secure-store.mjs';
import { Platform } from '../support/fakes/react-native.mjs';
test.beforeEach(() => {
  control.reset();
  Platform.OS = 'android';
});
test.afterEach(() => {
  control.reset();
  Platform.OS = 'android';
});
test('valid URL-safe code round trips and clear removes it', async () => {
  const code = 'A_-'.repeat(14) + 'a';
  assert.equal(validHandoffCode(code), true);
  await writePendingHandoff(code);
  assert.equal(await readPendingHandoff(), code);
  for (const bad of ['a'.repeat(42), 'a'.repeat(44), '!'.repeat(43)]) {
    await assert.rejects(writePendingHandoff(bad));
    assert.equal(await readPendingHandoff(), code);
  }
  await writePendingHandoff(null);
  assert.equal(await readPendingHandoff(), null);
  await setItemAsync('fire3d.pending-playtest-handoff.v1', 'invalid');
  assert.equal(await readPendingHandoff(), null);
});
test('web does not persist handoff; native storage errors propagate', async () => {
  Platform.OS = 'web';
  await writePendingHandoff('a'.repeat(43));
  assert.equal(await getItemAsync('fire3d.pending-playtest-handoff.v1'), null);
  assert.equal(await readPendingHandoff(), null);
  Platform.OS = 'android';
  control.fail = () => {
    throw Error('locked');
  };
  await assert.rejects(writePendingHandoff('a'.repeat(43)), /locked/);
  await assert.rejects(readPendingHandoff(), /locked/);
});
