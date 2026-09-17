import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildings,
  resolveDemoCode,
  saveBuilding,
  matchBuilding,
  getLaunchIssue,
} from '../src/features/buildings/buildings.model.ts';
import {
  initialState,
  parseDemoState,
  validateDemoLogin,
  DEMO_EMAIL,
  DEMO_PASSWORD,
} from '../src/store/demo.model.ts';

test('QR accepts only demo codes and exact deep links, never arbitrary URLs', () => {
  assert.equal(resolveDemoCode(' f3d-anbinh ').id, 'an-binh');
  assert.equal(resolveDemoCode('fire3d://demo/hoa-sen').id, 'hoa-sen');
  for (const code of [
    'https://evil.test/F3D-ANBINH',
    'fire3d://demo/an-binh?redirect=evil',
    '',
    'x'.repeat(257),
  ])
    assert.throws(() => resolveDemoCode(code));
});
test('rescanning updates a building without duplication or removing other buildings', () => {
  let saved = saveBuilding([], buildings[0], '2026-09-17T10:00:00Z');
  saved = saveBuilding(saved, buildings[1], '2026-09-17T10:01:00Z');
  saved = saveBuilding(saved, buildings[0], '2026-09-17T10:02:00Z');
  assert.equal(saved.length, 2);
  assert.equal(saved[0].id, 'an-binh');
  assert.equal(saved[0].scannedAt, '2026-09-17T10:02:00Z');
});
test('closed training is blocked and search supports Vietnamese without accents', () => {
  assert.equal(getLaunchIssue(buildings[0]), null);
  assert.ok(getLaunchIssue(buildings[2]));
  assert.ok(matchBuilding(buildings[0], 'AN BINH'));
  assert.ok(matchBuilding(buildings[1], 'trường'));
  assert.ok(!matchBuilding(buildings[1], 'an binh'));
});
test('invalid persisted data recovers safely and stale ids/duplicates are discarded', () => {
  assert.deepEqual(parseDemoState('{broken'), initialState);
  assert.deepEqual(parseDemoState('{"version":2}'), initialState);
  const valid = { id: 'an-binh', scannedAt: '2026-09-17T10:00:00Z' };
  const parsed = parseDemoState(
    JSON.stringify({
      version: 1,
      signedIn: true,
      saved: [
        valid,
        valid,
        null,
        { id: 'unknown', scannedAt: valid.scannedAt },
        { id: 'hoa-sen', scannedAt: 'bad-date' },
      ],
      reducedMotion: 'yes',
    }),
  );
  assert.deepEqual(parsed.saved, [valid]);
  assert.equal(parsed.reducedMotion, false);
});
test('demo login never treats arbitrary credentials as successful authentication', () => {
  assert.equal(validateDemoLogin(DEMO_EMAIL, DEMO_PASSWORD), null);
  assert.ok(validateDemoLogin('invalid', 'anything'));
  assert.ok(validateDemoLogin('real@example.com', 'password'));
  assert.ok(validateDemoLogin(DEMO_EMAIL, 'incorrect'));
});
