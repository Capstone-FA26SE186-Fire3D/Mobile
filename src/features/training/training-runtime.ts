import { AppState } from 'react-native';
import {
  heartbeatTrainingSession,
  reconcileUnityLaunched,
  syncTrainingSession,
  type CompleteResponse,
} from '@/api/training';
import {
  heartbeatPlaytest,
  reconcilePlaytestLaunched,
  syncPlaytest,
  type PlaytestSyncResult,
} from '@/api/playtest';
import { ApiError } from '@/api/types/common';
import {
  ingestUnityCallbacks,
  sessionsToSync,
  type IngestedMessage,
  type TrainingSyncRow,
} from './event-queue.native';
import { checkUnityRuntime } from './runtime-version.ts';
import { retryDelayMs } from './session-contract';
import { unityBridge } from './unity-bridge.native';

export type TrainingRuntimeEvent =
  | { kind: 'unity'; message: IngestedMessage }
  | { kind: 'synced'; sessionId: string; response: CompleteResponse | null }
  /** A playtest sync pass: completed on BE, nothing to complete yet, or moved to recovery (no automatic retry). */
  | { kind: 'playtest-synced'; playtestId: string; result: PlaytestSyncResult }
  | { kind: 'sync-failed'; sessionId: string | null; message: string; offline: boolean }
  /** Unity's Ready names another runtime than the one this app reports to BE: the embedded export is out of date. */
  | { kind: 'runtime-mismatch'; message: string };

const listeners = new Set<(event: TrainingRuntimeEvent) => void>();
const lastHeartbeat = new Map<string, number>();
const heartbeatStopped = new Set<string>();
let running: Promise<void> | null = null;
let again = false;
let failures = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = 0;
/** The signed-in account the loop syncs for; other accounts' sessions wait on this device until they sign in. */
let owner: RuntimeOwner | null = null;

export type RuntimeOwner = { accountId: string; role: 'Trainee' | 'OrganizationUser' };

export function isOfflineError(issue: unknown): boolean {
  return (
    !(issue instanceof ApiError) &&
    issue instanceof Error &&
    /network|fetch|timeout|internet|offline|connection/i.test(issue.message)
  );
}

export function describeSyncError(issue: unknown): string {
  if (isOfflineError(issue))
    return 'Chưa có mạng. Kết quả vẫn được lưu trên máy và sẽ tự đồng bộ khi có kết nối.';
  if (issue instanceof ApiError && issue.status >= 500)
    return 'Máy chủ FET3D đang bận. Ứng dụng sẽ thử đồng bộ lại.';
  return issue instanceof Error ? issue.message : 'Đồng bộ phiên thất bại.';
}

export function subscribeTrainingRuntime(
  listener: (event: TrainingRuntimeEvent) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(event: TrainingRuntimeEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A screen listener must never break the sync loop.
    }
  }
}

function needsSync(row: TrainingSyncRow): boolean {
  return (
    row.pending_events > 0 || (row.completion_state != null && row.completion_state !== 'completed')
  );
}

async function heartbeat(sessionId: string, send: (id: string) => Promise<unknown>) {
  if (heartbeatStopped.has(sessionId)) return;
  const now = Date.now();
  if (now - (lastHeartbeat.get(sessionId) ?? 0) < 60_000) return;
  lastHeartbeat.set(sessionId, now);
  try {
    await send(sessionId);
  } catch (issue) {
    // 404/409: the session is no longer running on BE; stop heartbeats, events/completion still sync.
    if (issue instanceof ApiError && (issue.status === 404 || issue.status === 409))
      heartbeatStopped.add(sessionId);
    else throw issue;
  }
}

async function pumpOnce(): Promise<boolean> {
  let failed = false;
  const fail = (sessionId: string | null, issue: unknown) => {
    failed = true;
    emit({
      kind: 'sync-failed',
      sessionId,
      message: describeSyncError(issue),
      offline: isOfflineError(issue),
    });
  };
  // Callbacks are always persisted (and acknowledged natively only after the JS store commits), whoever is signed in.
  try {
    for (const message of await ingestUnityCallbacks()) {
      if (message.type === 'Ready') {
        const mismatch = checkUnityRuntime(message.payload);
        if (mismatch) emit({ kind: 'runtime-mismatch', message: mismatch });
      }
      emit({ kind: 'unity', message });
    }
  } catch (issue) {
    fail(null, issue);
  }
  const current = owner;
  if (!current) return failed;
  const trainee = current.role === 'Trainee';
  try {
    if (trainee) await reconcileUnityLaunched(current.accountId);
    else await reconcilePlaytestLaunched(current.accountId);
  } catch (issue) {
    fail(null, issue);
  }
  let rows: TrainingSyncRow[] = [];
  try {
    rows = await sessionsToSync(current.accountId, trainee);
  } catch (issue) {
    fail(null, issue);
  }
  // Routed by kind; each session is tried on its own so one failing session never blocks another's queue.
  for (const row of rows) {
    try {
      if (row.kind === 'Playtest') {
        if (needsSync(row)) {
          const result = await syncPlaytest(row.session_id);
          emit({ kind: 'playtest-synced', playtestId: row.session_id, result });
        } else if (row.launch_state === 'launched' && row.completion_state == null)
          await heartbeat(row.session_id, heartbeatPlaytest);
      } else if (needsSync(row)) {
        const response = await syncTrainingSession(row.session_id, current.accountId);
        emit({ kind: 'synced', sessionId: row.session_id, response });
      } else if (row.launch_state === 'launched' && row.completion_state == null) {
        await heartbeat(row.session_id, heartbeatTrainingSession);
      }
    } catch (issue) {
      fail(row.session_id, issue);
    }
  }
  if (failed) return true;
  try {
    return (await sessionsToSync(current.accountId, trainee)).some(needsSync);
  } catch {
    return true;
  }
}

function schedule(more: boolean) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!more) {
    failures = 0;
    return;
  }
  const delay = retryDelayMs(failures++);
  timer = setTimeout(() => void pumpTrainingRuntime(), delay);
}

/**
 * Single-flight, one receiver for Trainee training and OrganizationUser playtests: ingest Unity callbacks (persisted before ack), confirm Launched,
 * sync events/completions (stable completion key), retry with backoff.
 */
export function pumpTrainingRuntime(): Promise<void> {
  if (!unityBridge.available) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let more = false;
    do {
      again = false;
      more = await pumpOnce();
    } while (again);
    schedule(more);
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Starts the device-wide loop once (ref-counted): on Unity callbacks, on app start, and whenever the app becomes active
 * again. JS timers pause while Unity is in front, so callbacks and AppState drive the loop rather than polling.
 */
export function startTrainingRuntime(account: RuntimeOwner): () => void {
  if (!unityBridge.available) return () => {};
  owner = account;
  started++;
  const unsubscribeCallback = unityBridge.onCallback(() => void pumpTrainingRuntime());
  const appState = AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    failures = 0;
    void pumpTrainingRuntime();
  });
  void pumpTrainingRuntime();
  return () => {
    unsubscribeCallback();
    appState.remove();
    if (--started === 0) {
      owner = null;
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}
