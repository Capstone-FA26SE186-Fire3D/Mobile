// Organization playtest on Mobile: prepare/start split, idempotent start, mode choice, the shared Unity callback queue
// (node:sqlite stands in for expo-sqlite, see tests/support) and playtest sync/recovery against a scripted BE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteFor } from './support/fakes/expo-sqlite.mjs';
import { ApiError } from '../src/api/types/common.ts';

const ACCOUNT = 'acc-org-1';
const OTHER = 'acc-org-2';
const PLAYTEST = '11111111-1111-4111-8111-111111111111';
const PLAYTEST_2 = '22222222-2222-4222-8222-222222222222';
const hash = (char) => char.repeat(64);
const future = () => new Date(Date.now() + 5 * 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

/** Native Fire3DUnity fake: a journal of raw callbacks, acknowledged by id, plus launch/abort records. */
const native = {
  journal: [],
  nextId: 1,
  launches: [],
  aborts: [],
  active: null,
  handshakeValue: { source: 'embedded', runtimeVersion: '2.0.2', protocolVersion: null },
  push(message) {
    this.journal.push({
      id: this.nextId++,
      payload: JSON.stringify(message),
      receivedAt: Date.now(),
    });
  },
  async pendingCallbacks() {
    return [...this.journal];
  },
  async acknowledgeCallback(id) {
    this.journal = this.journal.filter((item) => item.id !== id);
  },
  async launch(payload) {
    this.launches.push(JSON.parse(payload));
  },
  async show() {
    return false;
  },
  async pause() {},
  async resume() {},
  async abort(reason) {
    this.aborts.push(reason);
  },
  async handshake() {
    return this.handshakeValue;
  },
  async activeSession() {
    return this.active;
  },
};
globalThis.__unityNative = native;

function status(overrides = {}) {
  return {
    id: PLAYTEST,
    buildingId: '33333333-3333-4333-8333-333333333333',
    revisionId: 'rev-1',
    scenarioVersionId: '44444444-4444-4444-8444-444444444444',
    status: 'Created',
    runtimeVersion: null,
    package: { packageHash: hash('a'), manifestHash: hash('b'), buildTarget: 'Android' },
    grant: null,
    acknowledgedSequence: 0,
    boundToMobile: true,
    launchSession: true,
    recovery: { canStart: true, canReissueGrant: false, canSync: false, canCancel: true },
    completion: null,
    ...overrides,
  };
}

function grant(overrides = {}) {
  return {
    playtestId: PLAYTEST,
    packageHash: hash('a'),
    manifestHash: hash('b'),
    runtimeVersion: '2.0.2',
    protocolVersion: '1',
    expiresAt: future(),
    generation: 1,
    launchGrant: 'jwt',
    ...overrides,
  };
}

const problem = (status, code) => new ApiError(code, status, { code });

function event(sequence, overrides = {}) {
  return {
    eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    sequence,
    schemaVersion: '1',
    type: 'session.started',
    occurredAt: '2026-10-20T00:00:00Z',
    elapsedMs: sequence * 10,
    payload: {},
    ...overrides,
  };
}

/** Memory key storage and a BE fake that counts Trial units by distinct start keys (BE idempotency). */
function fakeBackend(initial = status()) {
  const keys = new Map();
  const startKeys = new Set();
  const calls = [];
  let current = initial;
  const be = {
    trial: 0,
    calls,
    loseNextStartResponse: false,
    grantExpiresAt: future(),
    reissueGeneration: 1,
    get status() {
      return current;
    },
    async getStatus() {
      calls.push('status');
      return current;
    },
    async start(id, key) {
      calls.push(`start:${key}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (!startKeys.has(key)) {
        if (current.status !== 'Created') throw problem(409, 'PLAYTEST_ALREADY_STARTED');
        startKeys.add(key);
        be.trial++;
        current = {
          ...current,
          status: 'Launching',
          recovery: { ...current.recovery, canStart: false, canReissueGrant: true },
        };
      }
      if (be.loseNextStartResponse) {
        be.loseNextStartResponse = false;
        throw new TypeError('Network request failed');
      }
      if (Date.parse(be.grantExpiresAt) <= Date.now()) throw problem(409, 'PLAYTEST_GRANT_EXPIRED');
      return grant({ expiresAt: be.grantExpiresAt });
    },
    async reissue(id, key) {
      calls.push(`reissue:${key}`);
      be.reissueGeneration++;
      return grant({ generation: be.reissueGeneration, expiresAt: future() });
    },
  };
  const storage = {
    async getItem(name) {
      return keys.get(name) ?? null;
    },
    async setItem(name, value) {
      keys.set(name, value);
    },
    async removeItem(name) {
      keys.delete(name);
    },
  };
  return { be, storage, keys };
}

test('SQLite migration keeps pending rows of the old schema and ties them to nobody', async () => {
  // Old (pre-account) schema with an unsynced Trainee session, opened before the app code migrates it.
  const db = sqliteFor('fire3d-training-queue.db');
  db.exec(`CREATE TABLE bridge_messages (native_id INTEGER PRIMARY KEY, session_id TEXT, type TEXT NOT NULL,
      payload_json TEXT NOT NULL, handled INTEGER NOT NULL DEFAULT 0, received_at INTEGER);
    CREATE TABLE unity_events (session_id TEXT NOT NULL, event_id TEXT NOT NULL, sequence INTEGER NOT NULL,
      json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', conflict_code TEXT,
      PRIMARY KEY(session_id,event_id), UNIQUE(session_id,sequence));
    CREATE TABLE session_completions (session_id TEXT PRIMARY KEY, key TEXT NOT NULL, last_sequence INTEGER NOT NULL,
      end_reason TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE session_launches (session_id TEXT PRIMARY KEY, kind TEXT NOT NULL, generation INTEGER NOT NULL,
      expires_at TEXT NOT NULL, manifest_path TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending');
    INSERT INTO session_launches VALUES ('legacy-training','Training',1,'2026-10-19T00:00:00Z','/m.json','launched');
    INSERT INTO unity_events(session_id,event_id,sequence,json) VALUES ('legacy-training','e1',1,'{}');`);
  const queue = await import('../src/features/training/event-queue.native.ts');
  const trainee = await queue.sessionsToSync('trainee-1', true);
  assert.deepEqual(
    trainee.map((row) => [row.session_id, row.kind, row.pending_events]),
    [['legacy-training', 'Training', 1]],
  );
  // An OrganizationUser never syncs a Trainee's legacy row.
  assert.deepEqual(await queue.sessionsToSync(ACCOUNT, false), []);
  const launch = await queue.getLaunch('legacy-training');
  assert.equal(launch.account_id, null);
  assert.equal(launch.sync_state, 'active');
});

test('modes come from the verified scenario: Guided preferred, policy order, runtime modes without policy', async () => {
  const { selectPlaytestModes } = await import('../src/features/playtest/playtest-flow.ts');
  assert.deepEqual(
    selectPlaytestModes({ modePolicy: { allowedModes: ['Assessment', 'Guided', 'Learn'] } }),
    { modes: ['Learn', 'Guided', 'Assessment'], preferred: 'Guided', fromPolicy: true },
  );
  assert.equal(
    selectPlaytestModes({ modePolicy: { allowedModes: ['Assessment', 'Learn'] } }).preferred,
    'Learn',
  );
  assert.deepEqual(selectPlaytestModes({ modePolicy: { allowedModes: ['Assessment'] } }).modes, [
    'Assessment',
  ]);
  assert.deepEqual(selectPlaytestModes({ name: 'no policy' }), {
    modes: ['Learn', 'Guided', 'Assessment'],
    preferred: 'Guided',
    fromPolicy: false,
  });
  assert.equal(selectPlaytestModes(null).preferred, 'Guided');
  assert.deepEqual(selectPlaytestModes({ modePolicy: { allowedModes: ['Sprint'] } }).modes, []);
});

test('start is offered only for a verified package with launchSession and canStart; final states stay final', async () => {
  const { playtestStep } = await import('../src/features/playtest/playtest-flow.ts');
  const none = { packageReady: false, unityAlive: false };
  const ready = { packageReady: true, unityAlive: false };
  assert.equal(playtestStep(status(), none).name, 'prepare');
  assert.equal(playtestStep(status(), ready).name, 'start');
  assert.equal(
    playtestStep(status({ recovery: { ...status().recovery, canStart: false } }), ready).name,
    'prepare',
  );
  assert.equal(playtestStep(status({ launchSession: false }), ready).name, 'not-launch-session');
  const launching = status({
    status: 'Launching',
    recovery: { canStart: false, canReissueGrant: true, canSync: true, canCancel: true },
  });
  assert.equal(playtestStep(launching, ready).name, 'retry-launch');
  assert.equal(
    playtestStep(launching, { packageReady: true, unityAlive: true }).name,
    'back-to-unity',
  );
  assert.equal(
    playtestStep(
      { ...launching, recovery: { ...launching.recovery, canReissueGrant: false } },
      ready,
    ).name,
    'wait-launch',
  );
  const running = status({ status: 'Running' });
  assert.equal(
    playtestStep(running, { packageReady: true, unityAlive: true }).name,
    'back-to-unity',
  );
  assert.equal(playtestStep(running, ready).name, 'running-elsewhere');
  assert.deepEqual(playtestStep(status({ status: 'Completed' }), ready), {
    name: 'final',
    state: 'Completed',
  });
  assert.deepEqual(playtestStep(status({ status: 'Cancelled', launchSession: false }), ready), {
    name: 'final',
    state: 'Cancelled',
  });
});

test('handoff is redeemed only by a signed-in OrganizationUser; wrong account gets a clear message', async () => {
  const { handoffView, describePlaytestProblem } =
    await import('../src/features/playtest/playtest-flow.ts');
  assert.equal(handoffView(false, { role: 'OrganizationUser' }), 'invalid');
  assert.equal(handoffView(true, null), 'login');
  assert.equal(handoffView(true, { role: 'Trainee' }), 'wrong-role');
  assert.equal(handoffView(true, { role: 'OrganizationUser' }), 'redeem');
  assert.match(
    describePlaytestProblem(problem(404, 'PLAYTEST_HANDOFF_INVALID'), ''),
    /không thuộc tài khoản này/,
  );
  assert.match(
    describePlaytestProblem(problem(409, 'PLAYTEST_HANDOFF_USED'), ''),
    /phiên đăng nhập khác/,
  );
  assert.match(
    describePlaytestProblem(problem(409, 'PLAYTEST_SESSION_MISMATCH'), ''),
    /phiên đăng nhập khác/,
  );
});

test('playtest problems: runtime, entitlement/Trial, grant expired, hash mismatch', async () => {
  const { describePlaytestProblem } = await import('../src/features/playtest/playtest-flow.ts');
  assert.match(describePlaytestProblem(problem(409, 'RUNTIME_INCOMPATIBLE'), ''), /2\.0\.2/);
  assert.match(
    describePlaytestProblem(problem(409, 'PLAYTEST_ENTITLEMENT_REQUIRED'), ''),
    /hết lượt Trial/,
  );
  assert.match(describePlaytestProblem(problem(409, 'PLAYTEST_GRANT_EXPIRED'), ''), /Thử mở lại/);
  assert.match(
    describePlaytestProblem(new Error('File package sai kích thước hoặc SHA-256: a.bundle.'), ''),
    /tải lại package/,
  );
  assert.match(describePlaytestProblem({ code: 'RUNTIME_MISMATCH' }, ''), /Unity trong ứng dụng/);
});

test('a grant for another runtime, package or playtest is refused (never plays as 2.0.0)', async () => {
  const { assertPlaytestGrant, GrantExpiredError } =
    await import('../src/features/playtest/playtest-flow.ts');
  assert.equal(assertPlaytestGrant(grant(), status()).generation, 1);
  assert.throws(() => assertPlaytestGrant(grant({ runtimeVersion: '2.0.0' }), status()), /2\.0\.0/);
  assert.throws(() => assertPlaytestGrant(grant({ manifestHash: hash('c') }), status()), /SHA-256/);
  assert.throws(() => assertPlaytestGrant(grant({ playtestId: PLAYTEST_2 }), status()));
  assert.throws(() => assertPlaytestGrant(grant({ protocolVersion: '2' }), status()), /protocol/);
  assert.throws(
    () => assertPlaytestGrant(grant({ expiresAt: past() }), status()),
    GrantExpiredError,
  );
});

test('double tap starts once: the second tap is refused while the first runs', async () => {
  const { acquirePlaytestGrant, createPlaytestKeys, PlaytestBusyError } =
    await import('../src/features/playtest/playtest-flow.ts');
  const { be, storage } = fakeBackend();
  const keys = createPlaytestKeys(storage, () => crypto.randomUUID());
  const first = acquirePlaytestGrant(be, keys, ACCOUNT, status());
  await assert.rejects(acquirePlaytestGrant(be, keys, ACCOUNT, status()), PlaytestBusyError);
  assert.equal((await first).launchGrant, 'jwt');
  assert.equal(be.trial, 1);
  assert.equal(be.calls.filter((call) => call.startsWith('start:')).length, 1);
});

test('lost /start response: read status, replay the same key, no extra Trial; retry later reuses it too', async () => {
  const { acquirePlaytestGrant, createPlaytestKeys } =
    await import('../src/features/playtest/playtest-flow.ts');
  const { be, storage } = fakeBackend();
  const keys = createPlaytestKeys(storage, () => crypto.randomUUID());
  be.loseNextStartResponse = true;
  const launch = await acquirePlaytestGrant(be, keys, ACCOUNT, status());
  assert.equal(launch.generation, 1);
  assert.equal(be.trial, 1);
  const starts = be.calls.filter((call) => call.startsWith('start:'));
  assert.equal(starts.length, 2);
  assert.equal(starts[0], starts[1]);
  assert.deepEqual(be.calls.slice(0, 3), [starts[0], 'status', starts[0]]);
  // The app crashed before launch and the screen still shows Created: the persisted key replays, Trial unchanged.
  await acquirePlaytestGrant(be, keys, ACCOUNT, status());
  assert.equal(be.trial, 1);
  // Another account on the same device has its own keys.
  assert.notEqual(
    await keys.get(OTHER, PLAYTEST, 'start'),
    await keys.get(ACCOUNT, PLAYTEST, 'start'),
  );
});

test('a start whose first grant expired is recovered by a reissue, not a second start', async () => {
  const { acquirePlaytestGrant, createPlaytestKeys } =
    await import('../src/features/playtest/playtest-flow.ts');
  const { be, storage } = fakeBackend();
  const keys = createPlaytestKeys(storage, () => crypto.randomUUID());
  be.grantExpiresAt = past();
  const launch = await acquirePlaytestGrant(be, keys, ACCOUNT, status());
  assert.equal(launch.generation, 2);
  assert.equal(be.trial, 1);
  assert.equal(be.calls.filter((call) => call.startsWith('reissue:')).length, 1);
});

test('"Thử mở lại" reissues with a persisted key and rotates it only after that grant expired', async () => {
  const { acquirePlaytestGrant, createPlaytestKeys } =
    await import('../src/features/playtest/playtest-flow.ts');
  const launching = status({
    status: 'Launching',
    recovery: { canStart: false, canReissueGrant: true, canSync: true, canCancel: true },
  });
  const { be, storage } = fakeBackend(launching);
  const keys = createPlaytestKeys(storage, () => crypto.randomUUID());
  let expired = true;
  be.reissue = async (id, key) => {
    be.calls.push(`reissue:${key}`);
    if (expired) {
      expired = false;
      throw problem(409, 'PLAYTEST_GRANT_EXPIRED');
    }
    return grant({ generation: 3 });
  };
  assert.equal((await acquirePlaytestGrant(be, keys, ACCOUNT, launching)).generation, 3);
  const reissues = be.calls.filter((call) => call.startsWith('reissue:'));
  assert.equal(reissues.length, 2);
  assert.notEqual(reissues[0], reissues[1]);
  assert.equal(be.trial, 0);
  await assert.rejects(
    acquirePlaytestGrant(be, keys, ACCOUNT, status({ status: 'Running' })),
    /đã được mở/,
  );
});

test('handshake runs before /start: a runtime mismatch is reported without touching BE', async () => {
  const { launchPlaytest } = await import('../src/api/playtest.ts');
  const { checkUnityHandshake } = await import('../src/features/training/runtime-version.ts');
  assert.equal(
    checkUnityHandshake({ source: 'embedded', runtimeVersion: '2.0.2', protocolVersion: null }),
    null,
  );
  assert.equal(
    checkUnityHandshake({ source: 'ready', runtimeVersion: '2.0.2', protocolVersion: '1' }),
    null,
  );
  assert.match(
    checkUnityHandshake({ source: 'ready', runtimeVersion: '2.0.1', protocolVersion: '1' }),
    /2\.0\.1/,
  );
  globalThis.__requests = [];
  globalThis.__be = () => assert.fail('BE must not be called');
  native.handshakeValue = { source: 'embedded', runtimeVersion: '2.0.0', protocolVersion: null };
  await assert.rejects(
    launchPlaytest(status(), 'Guided', ACCOUNT, '/pkg/manifest.json'),
    (issue) => issue.code === 'RUNTIME_MISMATCH',
  );
  assert.equal(globalThis.__requests.length, 0);
  native.handshakeValue = { source: 'embedded', runtimeVersion: '2.0.2', protocolVersion: null };
});

test('start opens Unity with kind Playtest, the chosen mode and runtime 2.0.2, tied to the account', async () => {
  const { launchPlaytest } = await import('../src/api/playtest.ts');
  const queue = await import('../src/features/training/event-queue.native.ts');
  globalThis.__be = async (path) => {
    if (path.endsWith('/start')) return grant();
    throw new Error(`unexpected ${path}`);
  };
  native.launches = [];
  await launchPlaytest(status(), 'Guided', ACCOUNT, '/pkg/manifest.json');
  assert.deepEqual(native.launches, [
    {
      protocolVersion: '1',
      sessionId: PLAYTEST,
      kind: 'Playtest',
      mode: 'Guided',
      runtimeVersion: '2.0.2',
      manifestPath: '/pkg/manifest.json',
      resumeFromSequence: 0,
      locale: 'vi',
    },
  ]);
  const launch = await queue.getLaunch(PLAYTEST);
  assert.equal(launch.account_id, ACCOUNT);
  assert.equal(launch.kind, 'Playtest');
});

test('callbacks: persisted before ack, duplicates stored once, a bad callback never blocks other sessions', async () => {
  const queue = await import('../src/features/training/event-queue.native.ts');
  await queue.saveLaunch(PLAYTEST_2, 'Playtest', 1, future(), '/m2.json', ACCOUNT);
  native.push({ type: 'Events', sessionId: PLAYTEST, payload: [event(1), event(2)] });
  native.push({ type: 'Events', sessionId: PLAYTEST, payload: [event(2)] });
  // Same sequence, different content: rejected, kept for support, acknowledged.
  native.push({ type: 'Events', sessionId: PLAYTEST_2, payload: [event(1)] });
  native.push({ type: 'Events', sessionId: PLAYTEST_2, payload: [event(1, { type: 'other' })] });
  native.push({ type: 'Events', sessionId: PLAYTEST, payload: [event(3)] });
  const ingested = await queue.ingestUnityCallbacks();
  assert.deepEqual(
    ingested.map((message) => message.type),
    ['Events', 'Events', 'Events', 'Rejected', 'Events'],
  );
  assert.equal(native.journal.length, 0);
  assert.deepEqual(
    (await queue.pendingEvents(PLAYTEST)).map((item) => item.sequence),
    [1, 2, 3],
  );
  assert.equal((await queue.getLaunch(PLAYTEST_2)).recovery_code, 'CALLBACK_REJECTED');
  assert.deepEqual(
    (await queue.sessionsToSync(ACCOUNT, false)).map((row) => row.session_id),
    [PLAYTEST],
  );
});

test('Launched: confirmed with the grant generation; stale grant stops the play and goes to recovery', async () => {
  const queue = await import('../src/features/training/event-queue.native.ts');
  const { reconcilePlaytestLaunched } = await import('../src/api/playtest.ts');
  await queue.saveLaunch(PLAYTEST_2, 'Playtest', 2, future(), '/m2.json', ACCOUNT);
  native.push({ type: 'Launched', sessionId: PLAYTEST, payload: {} });
  native.push({ type: 'Launched', sessionId: PLAYTEST_2, payload: {} });
  await queue.ingestUnityCallbacks();
  native.active = PLAYTEST_2;
  native.aborts = [];
  const confirmed = [];
  globalThis.__be = async (path, options) => {
    if (path.includes(PLAYTEST_2)) throw problem(409, 'PLAYTEST_GRANT_STALE');
    confirmed.push(options.json);
    return status({ status: 'Running' });
  };
  // Another account signed in: nothing is confirmed or dropped for this account's playtests.
  await reconcilePlaytestLaunched(OTHER);
  assert.equal((await queue.pendingLaunchedSignals()).length, 2);
  await reconcilePlaytestLaunched(ACCOUNT);
  assert.deepEqual(confirmed, [{ generation: 1 }]);
  assert.equal((await queue.getLaunch(PLAYTEST)).state, 'launched');
  const stale = await queue.getLaunch(PLAYTEST_2);
  assert.equal(stale.sync_state, 'recovery');
  assert.equal(stale.recovery_code, 'PLAYTEST_GRANT_STALE');
  assert.deepEqual(native.aborts, [JSON.stringify({ reason: 'LaunchGrantExpired' })]);
  assert.equal((await queue.pendingLaunchedSignals()).length, 0);
  native.active = null;
});

test('Launched after the grant expired is never confirmed; a network failure keeps the signal', async () => {
  const queue = await import('../src/features/training/event-queue.native.ts');
  const { reconcilePlaytestLaunched } = await import('../src/api/playtest.ts');
  const late = '55555555-5555-4555-8555-555555555555';
  const offline = '66666666-6666-4666-8666-666666666666';
  await queue.saveLaunch(late, 'Playtest', 1, past(), '/m.json', ACCOUNT);
  await queue.saveLaunch(offline, 'Playtest', 1, future(), '/m.json', ACCOUNT);
  native.push({ type: 'Launched', sessionId: late, payload: {} });
  native.push({ type: 'Launched', sessionId: offline, payload: {} });
  await queue.ingestUnityCallbacks();
  const paths = [];
  globalThis.__be = async (path) => {
    paths.push(path);
    throw new TypeError('Network request failed');
  };
  await assert.rejects(reconcilePlaytestLaunched(ACCOUNT), /Network/);
  assert.deepEqual(paths, [`/api/playtests/${offline}/launched`]);
  assert.equal((await queue.getLaunch(late)).recovery_code, 'PLAYTEST_GRANT_EXPIRED');
  const left = await queue.pendingLaunchedSignals();
  assert.deepEqual(
    left.map((signal) => signal.session_id),
    [offline],
  );
});

test('lost completion response: the same Idempotency-Key is replayed, then the playtest is done', async () => {
  const queue = await import('../src/features/training/event-queue.native.ts');
  const { syncPlaytest } = await import('../src/api/playtest.ts');
  native.push({
    type: 'Completed',
    sessionId: PLAYTEST,
    payload: { lastEventSequence: 3, endReason: 'Finished', score: 7 },
  });
  native.push({
    type: 'Completed',
    sessionId: PLAYTEST,
    payload: { lastEventSequence: 3, endReason: 'Finished', score: 7 },
  });
  await queue.ingestUnityCallbacks();
  const completeKeys = [];
  let batches = 0;
  let lose = true;
  globalThis.__be = async (path, options) => {
    if (path.endsWith('/events:batch')) {
      batches++;
      const ids = options.json.events.map((item) => item.eventId);
      assert.ok(options.json.events.every((item) => !('elapsedMs' in item)));
      return {
        accepted: ids,
        duplicates: [],
        conflicts: [],
        acknowledgedSequence: 3,
        missingRanges: [],
      };
    }
    if (path.endsWith('/complete')) {
      completeKeys.push(options.headers['Idempotency-Key']);
      assert.deepEqual(options.json, {
        lastEventSequence: 3,
        summary: { lastEventSequence: 3, endReason: 'Finished', score: 7 },
      });
      if (lose) {
        lose = false;
        throw new TypeError('Network request failed');
      }
      return status({ status: 'Completed' });
    }
    throw new Error(`unexpected ${path}`);
  };
  await assert.rejects(syncPlaytest(PLAYTEST), /Network/);
  const result = await syncPlaytest(PLAYTEST);
  assert.equal(result.kind, 'completed');
  assert.equal(batches, 1);
  assert.equal(completeKeys.length, 2);
  assert.equal(completeKeys[0], completeKeys[1]);
  assert.equal((await queue.completionFor(PLAYTEST)).state, 'completed');
  assert.ok(
    !(await queue.sessionsToSync(ACCOUNT, false)).some((row) => row.session_id === PLAYTEST),
  );
  assert.deepEqual(await syncPlaytest(PLAYTEST), { kind: 'nothing' });
});

test('a playtest cancelled on the Web goes to recovery once instead of retrying forever', async () => {
  const queue = await import('../src/features/training/event-queue.native.ts');
  const { syncPlaytest } = await import('../src/api/playtest.ts');
  const cancelled = '77777777-7777-4777-8777-777777777777';
  await queue.saveLaunch(cancelled, 'Playtest', 1, future(), '/m.json', ACCOUNT);
  native.push({ type: 'Events', sessionId: cancelled, payload: [event(1)] });
  await queue.ingestUnityCallbacks();
  let calls = 0;
  globalThis.__be = async (path) => {
    calls++;
    if (path.endsWith('/events:batch')) throw problem(409, 'PLAYTEST_TERMINAL');
    return status({ id: cancelled, status: 'Cancelled' });
  };
  assert.deepEqual(await syncPlaytest(cancelled), {
    kind: 'recovery',
    code: 'PLAYTEST_CANCELLED',
  });
  assert.equal(calls, 2);
  assert.ok(
    !(await queue.sessionsToSync(ACCOUNT, false)).some((row) => row.session_id === cancelled),
  );
});

test('relaunching an unconfirmed playtest drops the old attempt so new sequences cannot collide', async () => {
  const queue = await import('../src/features/training/event-queue.native.ts');
  const relaunch = '88888888-8888-4888-8888-888888888888';
  await queue.saveLaunch(relaunch, 'Playtest', 1, future(), '/m.json', ACCOUNT);
  native.push({ type: 'Events', sessionId: relaunch, payload: [event(1)] });
  native.push({ type: 'Launched', sessionId: relaunch, payload: {} });
  await queue.ingestUnityCallbacks();
  await queue.markRecovery(relaunch, 'PLAYTEST_GRANT_EXPIRED');
  await queue.saveLaunch(relaunch, 'Playtest', 2, future(), '/m.json', ACCOUNT);
  assert.deepEqual(await queue.pendingEvents(relaunch), []);
  assert.ok(
    !(await queue.pendingLaunchedSignals()).some((signal) => signal.session_id === relaunch),
  );
  const launch = await queue.getLaunch(relaunch);
  assert.equal(launch.sync_state, 'active');
  assert.equal(launch.generation, 2);
  native.push({
    type: 'Events',
    sessionId: relaunch,
    payload: [event(1, { type: 'new.attempt' })],
  });
  const [message] = await queue.ingestUnityCallbacks();
  assert.equal(message.type, 'Events');
});

test('Trainee regression: training reconcile ignores playtests and other accounts, legacy rows still sync', async () => {
  const queue = await import('../src/features/training/event-queue.native.ts');
  const { reconcileUnityLaunched } = await import('../src/api/training.ts');
  const mine = '99999999-9999-4999-8999-999999999999';
  const theirs = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await queue.saveLaunch(mine, 'Training', 1, future(), '/t.json', 'trainee-1');
  await queue.saveLaunch(theirs, 'Training', 1, future(), '/t.json', 'trainee-2');
  const playtestSignal = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await queue.saveLaunch(playtestSignal, 'Playtest', 1, future(), '/p.json', ACCOUNT);
  native.push({ type: 'Launched', sessionId: mine, payload: {} });
  native.push({ type: 'Launched', sessionId: theirs, payload: {} });
  native.push({ type: 'Launched', sessionId: playtestSignal, payload: {} });
  const paths = [];
  globalThis.__be = async (path, options) => {
    paths.push([path, options.json]);
    return {};
  };
  await reconcileUnityLaunched('trainee-1');
  assert.deepEqual(paths, [[`/api/training/sessions/${mine}/launched`, { generation: 1 }]]);
  assert.deepEqual(
    (await queue.pendingLaunchedSignals())
      .map((signal) => signal.session_id)
      .filter((id) => [mine, theirs, playtestSignal].includes(id))
      .sort(),
    [playtestSignal, theirs].sort(),
  );
  const rows = await queue.sessionsToSync('trainee-1', true);
  assert.deepEqual(rows.map((row) => row.session_id).sort(), ['legacy-training', mine].sort());
  assert.ok(rows.every((row) => row.kind === 'Training'));
});

test('prepare checks the playtest pin: expired signed URLs and a foreign manifest hash stop before download', async () => {
  const { playtestPin } = await import('../src/api/playtest.ts');
  const { planPackageDownload, crossCheckManifest, looksLikeExpiredUrl } =
    await import('../src/features/training/session-contract.ts');
  const pin = playtestPin(status());
  assert.equal(pin.releaseId, status().scenarioVersionId);
  assert.equal(pin.revisionId, 'rev-1');
  const download = {
    schemaVersion: 'fet3d.package/1',
    manifest: { url: 'https://s3.example.test/m.json?sig=1', sha256: hash('b'), sizeBytes: 10 },
    files: [
      {
        path: 'scenario.json',
        url: 'https://s3.example.test/s?sig=1',
        sha256: hash('e'),
        sizeBytes: 5,
      },
    ],
    floors: [],
    runtimeVersion: '2.0.0',
    buildTarget: 'Android',
    expiresAt: future(),
  };
  const plan = planPackageDownload(pin, download);
  assert.equal(plan.fileCount, 1);
  assert.throws(() => planPackageDownload(pin, { ...download, expiresAt: past() }), /hết hạn/);
  assert.throws(
    () =>
      planPackageDownload(pin, {
        ...download,
        manifest: { ...download.manifest, sha256: hash('f') },
      }),
    /không khớp manifest/,
  );
  assert.throws(
    () =>
      crossCheckManifest({ files: [{ path: 'scenario.json', sha256: hash('9'), size: 5 }] }, plan),
    /SHA-256/,
  );
  // A signed URL that expired mid-download (S3 403) re-fetches /package instead of failing.
  assert.equal(looksLikeExpiredUrl(new Error('HTTP 403 Forbidden')), true);
});
