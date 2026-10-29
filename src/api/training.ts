import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { requestWithSession } from './auth';
import { apiClient } from './client';
import { ApiError } from './types/common';
import {
  applyEventReceipt,
  completionFor,
  getLaunch,
  highestLocalSequence,
  ingestUnityCallbacks,
  markCompletion,
  markLaunched,
  pendingEvents,
  pendingLaunchedSignals,
  requeueMissingRanges,
  saveLaunch,
} from '@/features/training/event-queue.native';
import {
  assertPackageReady,
  prepareVerifiedPackage,
  type PackageProgress,
} from '@/features/training/package-cache.native';
import { APP_RUNTIME_VERSION, BRIDGE_PROTOCOL_VERSION } from '@/features/training/runtime-version';
import {
  assertStartMatchesPrepare,
  pinFromSession,
  planPackageDownload,
  type PackagePlan,
  type RuntimePackageDownload,
  type StartTrainingResponse,
  type TrainingMode,
  type TrainingSession,
} from '@/features/training/session-contract';
import { launchBelongsTo } from '@/features/training/launch-owner';
import { unityBridge } from '@/features/training/unity-bridge.native';

export type { TrainingSession, TrainingMode } from '@/features/training/session-contract';

type Range = { from: number; to: number };
type EventReceipt = {
  accepted: string[];
  duplicates: string[];
  conflicts: { eventId: string; code: string }[];
  acknowledgedSequence: number;
  missingRanges: Range[];
  status: string;
};
export type CompleteResponse = {
  status: 'Completed' | 'AwaitingSync' | string;
  session: TrainingSession;
  acknowledgedSequence: number;
  missingRanges: Range[];
};

const continuationKey = (id: string) => `fire3d.continuation.${id}`;
const sessionPath = (id: string, suffix = '') =>
  `/api/training/sessions/${encodeURIComponent(id)}${suffix ? `/${suffix}` : ''}`;

/** Creates (or, with the same persisted key, replays) the preparation. Never allocates a learner seat. */
export function prepareTrainingSession(
  trainingId: string,
  mode: TrainingMode,
  idempotencyKey: string,
): Promise<TrainingSession> {
  return requestWithSession('/api/training/sessions', {
    headers: { 'Idempotency-Key': idempotencyKey },
    json: { trainingId, mode, runtimeVersion: APP_RUNTIME_VERSION },
  });
}

export function getTrainingSession(id: string): Promise<TrainingSession> {
  return syncRequest<TrainingSession>(id, '', { method: 'GET' });
}

/** Side-effect-free lookup of the caller's sessions by id or by prepare/start idempotency key (crash recovery). */
export function reconcileTrainingSessions(input: {
  sessionIds?: string[];
  idempotencyKeys?: string[];
}): Promise<TrainingSession[]> {
  return requestWithSession('/api/training/reconcile', { json: input });
}

export function getTrainingPackage(id: string): Promise<RuntimePackageDownload> {
  return requestWithSession(sessionPath(id, 'package'));
}

/** Signed URLs for the session's pinned package, checked against the preparation pin. */
export async function planTrainingPackage(session: TrainingSession): Promise<PackagePlan> {
  return planPackageDownload(pinFromSession(session), await getTrainingPackage(session.id));
}

/** Downloads and verifies the pinned package into the local cache; returns the absolute manifest path for Unity. */
export async function downloadTrainingPackage(
  session: TrainingSession,
  options: { onProgress?: (progress: PackageProgress) => void; signal?: AbortSignal },
): Promise<string> {
  const plan = await planTrainingPackage(session);
  return prepareVerifiedPackage(plan, { ...options, refresh: () => planTrainingPackage(session) });
}

/**
 * Online start with a persisted Idempotency-Key. A replayed start whose five-minute grant already expired (crash before
 * launch) is started again with `freshKey()`: BE issues a new grant generation for the same session before launch.
 */
export async function startTrainingSession(
  prepared: TrainingSession,
  key: string,
  freshKey: () => Promise<string>,
): Promise<StartTrainingResponse> {
  const call = (idempotencyKey: string) =>
    requestWithSession<StartTrainingResponse>(sessionPath(prepared.id, 'start'), {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  let response = await call(key);
  if (!(Date.parse(response.launch?.expiresAt) > Date.now()))
    response = await call(await freshKey());
  assertStartMatchesPrepare(prepared, response);
  if (Platform.OS !== 'web')
    await SecureStore.setItemAsync(continuationKey(prepared.id), response.continuation.token);
  return response;
}

/**
 * Re-checks the downloaded package right before /start and before Unity gets the path: a package that is no longer
 * complete throws `PackageNotReady` (nothing is deleted; downloading again resumes from the files that still match).
 */
export function assertTrainingPackageReady(
  session: TrainingSession,
  manifestPath: string,
): Promise<void> {
  return assertPackageReady(pinFromSession(session), manifestPath);
}

/** Records the launch locally (for the Launched reconcile) and hands the verified package to Unity. */
export async function launchStartedSession(
  started: StartTrainingResponse,
  manifestPath: string,
  resumeFromSequence = 0,
  accountId: string | null = null,
): Promise<void> {
  const session = started.session;
  if (unityBridge.available) await assertTrainingPackageReady(session, manifestPath);
  await saveLaunch(
    session.id,
    'Training',
    started.launch.generation,
    started.launch.expiresAt,
    manifestPath,
    accountId,
  );
  await unityBridge.launch({
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    sessionId: session.id,
    kind: 'Training',
    mode: session.mode,
    runtimeVersion: APP_RUNTIME_VERSION,
    manifestPath,
    resumeFromSequence,
    locale: 'vi',
  });
}

/**
 * Confirms Unity's `Launched` to BE. A launch is valid when Unity reported it before the grant expired (native receive
 * time), even if the device was offline and this runs later.
 */
export async function reconcileUnityLaunched(accountId?: string): Promise<void> {
  await ingestUnityCallbacks();
  let failure: unknown = null;
  for (const signal of await pendingLaunchedSignals()) {
    const launch = await getLaunch(signal.session_id);
    if (launch?.kind === 'Playtest') continue;
    // Another account's launch waits for that account (legacy rows without account are the Trainee's).
    if (accountId && launch && !launchBelongsTo(launch, accountId, true)) continue;
    const reportedAt = signal.received_at ?? Date.now();
    if (!launch || Date.parse(launch.expires_at) < reportedAt) {
      await markLaunched(signal.native_id, signal.session_id);
      if ((await unityBridge.activeSession()) === signal.session_id)
        await unityBridge.abort('LaunchGrantExpired');
      failure ??= new Error('Unity đã mở sau khi grant hết hạn; phiên bị dừng.');
      continue;
    }
    try {
      await requestWithSession(sessionPath(signal.session_id, 'launched'), {
        json: { generation: launch.generation },
      });
      await markLaunched(signal.native_id, signal.session_id);
    } catch (issue) {
      // 4xx other than auth is final for this signal (e.g. BE already recorded another generation); keep playing.
      if (
        issue instanceof ApiError &&
        issue.status >= 400 &&
        issue.status < 500 &&
        issue.status !== 401
      )
        await markLaunched(signal.native_id, signal.session_id);
      // One failing signal never blocks the Launched signals of other sessions.
      failure ??= issue;
    }
  }
  if (failure) throw failure;
}

async function syncRequest<T>(
  id: string,
  suffix: string,
  options: { method: 'POST' | 'GET'; json?: unknown; headers?: Record<string, string> },
): Promise<T> {
  const path = sessionPath(id, suffix);
  try {
    return await requestWithSession<T>(path, options);
  } catch (issue) {
    if (!(issue instanceof ApiError) || issue.status !== 401 || Platform.OS === 'web') throw issue;
    const token = await SecureStore.getItemAsync(continuationKey(id));
    if (!token) throw issue;
    return apiClient.request<T>(path, { ...options, accessToken: token });
  }
}

export function heartbeatTrainingSession(
  id: string,
): Promise<{ serverTime: string; status: string }> {
  return syncRequest(id, 'heartbeat', { method: 'POST' });
}

/** Live login only: replaces the continuation token (7-day offline sync window) of a started session. */
export async function renewTrainingContinuation(id: string): Promise<void> {
  const continuation = await requestWithSession<{ token: string; expiresAt: string }>(
    sessionPath(id, 'continuation'),
    { method: 'POST' },
  );
  if (!continuation?.token) throw new Error('BE không cấp lại continuation token.');
  if (Platform.OS !== 'web')
    await SecureStore.setItemAsync(continuationKey(id), continuation.token);
}

/**
 * Sends queued events (≤ 500 per batch, stable event IDs) and then the completion with its persisted Idempotency-Key.
 * Returns null when there is nothing to complete yet.
 */
export async function syncTrainingSession(
  id: string,
  accountId?: string,
): Promise<CompleteResponse | null> {
  // Launched needs a live login; a continuation-only sync still sends events, so a failure here must not block them.
  await reconcileUnityLaunched(accountId).catch(() => undefined);
  let stalled = 0;
  for (let cycle = 0; cycle < 100; cycle++) {
    const events = await pendingEvents(id);
    if (events.length === 0) break;
    const receipt = await syncRequest<EventReceipt>(id, 'events:batch', {
      method: 'POST',
      json: { events },
    });
    await applyEventReceipt(id, receipt);
    const requeued = await requeueMissingRanges(id, receipt.missingRanges);
    if (
      receipt.accepted.length + receipt.duplicates.length + receipt.conflicts.length + requeued ===
      0
    ) {
      stalled++;
      if (stalled > 1) throw new Error('Đồng bộ event không tiến triển; cần đối soát phiên.');
    } else stalled = 0;
  }
  if ((await pendingEvents(id)).length > 0) throw new Error('Queue còn event chưa đồng bộ.');
  const completion = await completionFor(id);
  if (!completion || completion.state === 'completed') return null;
  const response = await syncRequest<CompleteResponse>(id, 'complete', {
    method: 'POST',
    headers: { 'Idempotency-Key': completion.key },
    json: { lastEventSequence: completion.last_sequence, endReason: completion.end_reason },
  });
  if (response.status === 'AwaitingSync') {
    await markCompletion(id, 'awaiting_sync');
    await requeueMissingRanges(id, response.missingRanges);
  } else if (response.status === 'Completed') await markCompletion(id, 'completed');
  return response;
}

export async function resumeSequence(id: string): Promise<number> {
  await syncTrainingSession(id);
  const session = await getTrainingSession(id);
  return Math.max(session.acknowledgedSequence ?? 0, await highestLocalSequence(id));
}
