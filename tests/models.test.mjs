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
import {
  advanceSession,
  createDemoSession,
  gameScenes,
  restartSession,
  scoreAssessment,
} from '../src/features/game/game.model.ts';

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
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.sessions, []);
  assert.deepEqual(parsed.results, []);
});
test('demo login never treats arbitrary credentials as successful authentication', () => {
  assert.equal(validateDemoLogin(DEMO_EMAIL, DEMO_PASSWORD), null);
  assert.ok(validateDemoLogin('invalid', 'anything'));
  assert.ok(validateDemoLogin('real@example.com', 'password'));
  assert.ok(validateDemoLogin(DEMO_EMAIL, 'incorrect'));
});

test('version 1 state migrates to version 2 without losing login and saved buildings', () => {
  const parsed = parseDemoState(
    JSON.stringify({
      version: 1,
      signedIn: true,
      saved: [{ id: 'hoa-sen', scannedAt: '2026-09-23T10:00:00Z' }],
      reducedMotion: true,
    }),
  );
  assert.equal(parsed.version, 2);
  assert.equal(parsed.signedIn, true);
  assert.equal(parsed.reducedMotion, true);
  assert.equal(parsed.saved[0].id, 'hoa-sen');
  assert.deepEqual(parsed.sessions, []);
});

test('three modes use one deterministic scene engine with mode-specific scoring', () => {
  for (const mode of ['learn', 'guided', 'assessment']) {
    let session = createDemoSession(
      { id: `session-${mode}`, trainingId: 'an-binh-smoke', buildingId: 'an-binh', mode },
      '2026-09-23T10:00:00Z',
    );
    for (const choice of ['observe-start', 'follow-landmarks', 'route-a'])
      session = advanceSession(session, choice, '2026-09-23T10:01:00Z').session;
    const completed = advanceSession(session, 'finish-session', '2026-09-23T10:02:00Z');
    assert.equal(completed.session.status, 'completed');
    assert.equal(completed.result.syncStatus, 'local-only');
    assert.equal(completed.result.score === null, mode !== 'assessment');
  }
});

test('wrong branch records exposure and re-plan, and completion is idempotent', () => {
  let session = createDemoSession(
    {
      id: 'session-replan',
      trainingId: 'an-binh-smoke',
      buildingId: 'an-binh',
      mode: 'assessment',
    },
    '2026-09-23T10:00:00Z',
  );
  for (const choice of ['observe-start', 'follow-landmarks', 'route-b', 'replan-route-a'])
    session = advanceSession(session, choice, '2026-09-23T10:01:00Z').session;
  const completed = advanceSession(session, 'finish-session', '2026-09-23T10:02:00Z');
  assert.equal(completed.result.wrongChoices, 1);
  assert.equal(completed.result.replanCount, 1);
  assert.equal(
    completed.result.score,
    scoreAssessment(completed.result.wrongChoices, completed.result.modeledExposure),
  );
  const duplicate = advanceSession(completed.session, 'finish-session');
  assert.equal(duplicate.session, completed.session);
  assert.equal(duplicate.result, undefined);
});

test('invalid scene choices are rejected and restart returns to the first checkpoint', () => {
  const session = createDemoSession({
    id: 'session-invalid',
    trainingId: 'hoa-sen-route',
    buildingId: 'hoa-sen',
    mode: 'guided',
  });
  assert.throws(() => advanceSession(session, 'route-b'));
  const progressed = advanceSession(session, gameScenes.start.choices[0].id).session;
  const restarted = restartSession(progressed, '2026-09-23T11:00:00Z');
  assert.equal(restarted.checkpoint.sceneId, 'start');
  assert.equal(restarted.checkpoint.sequence, 0);
  assert.deepEqual(restarted.checkpoint.chosenChoiceIds, []);
});
