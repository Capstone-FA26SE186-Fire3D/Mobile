import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveRecentPlaytest,
  readRecentPlaytest,
} from '../../src/features/playtest/recent-playtest.ts';
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
test('latest id replaces only its own account', async () => {
  assert.equal(await readRecentPlaytest('a'), null);
  await saveRecentPlaytest('a', 'first');
  await saveRecentPlaytest('b', 'foreign');
  await saveRecentPlaytest('a', 'latest');
  assert.equal(await readRecentPlaytest('a'), 'latest');
  assert.equal(await readRecentPlaytest('b'), 'foreign');
});
test('web does not use secure storage and native failures do not overwrite recent id', async () => {
  await saveRecentPlaytest('a', 'old');
  Platform.OS = 'web';
  await saveRecentPlaytest('a', 'web');
  assert.equal(await readRecentPlaytest('a'), null);
  Platform.OS = 'android';
  assert.equal(await readRecentPlaytest('a'), 'old');
  control.fail = (op) => {
    if (op === 'set') throw Error('locked');
  };
  await assert.rejects(saveRecentPlaytest('a', 'new'), /locked/);
  assert.equal(await readRecentPlaytest('a'), 'old');
});
