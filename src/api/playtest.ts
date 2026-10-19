import { requestWithSession } from './auth';
import { ApiError } from './types/common';
import { playtestKeys } from '@/features/playtest/playtest-keys';
import {
  acquirePlaytestGrant,
  problemCode,
  singleFlight,
  type PlaytestLaunch,
  type PlaytestStatus,
} from '@/features/playtest/playtest-flow';
import {
  applyEventReceipt,
  completionFor,
  completionSummaryFor,
  getLaunch,
  markCompletion,
  markLaunched,
  markRecovery,
  pendingEvents,
  pendingLaunchedSignals,
  requeueMissingRanges,
  saveLaunch,
} from '@/features/training/event-queue.native';
import { launchBelongsTo } from '@/features/training/launch-owner';
import {
  cachedPackagePath,
  prepareVerifiedPackage,
  readPackageScenario,
  type PackageDownloadOptions,
} from '@/features/training/package-cache.native';
import { type PackagePin } from '@/features/training/package-contract';
import {
  APP_RUNTIME_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  checkUnityHandshake,
} from '@/features/training/runtime-version';
import {
  planPackageDownload,
  type PackagePlan,
  type RuntimePackageDownload,
  type TrainingMode,
} from '@/features/training/session-contract';
import { UNITY_UNAVAILABLE_MESSAGE, unityBridge } from '@/features/training/unity-bridge.native';

export type { PlaytestLaunch, PlaytestStatus } from '@/features/playtest/playtest-flow';

const path = (id: string, suffix = '') =>
  `/api/playtests/${encodeURIComponent(id)}${suffix ? `/${suffix}` : ''}`;

export function redeemPlaytestHandoff(code: string): Promise<PlaytestStatus> {
  return requestWithSession('/api/playtests/handoffs/redeem', { json: { code } });
}

export function getPlaytest(id: string): Promise<PlaytestStatus> {
  return requestWithSession(path(id));
}

function postStart(id: string, key: string): Promise<PlaytestLaunch> {
  return requestWithSession(path(id, 'start'), {
    headers: { 'Idempotency-Key': key },
    json: { runtimeVersion: APP_RUNTIME_VERSION },
  });
}

function postReissue(id: string, key: string): Promise<PlaytestLaunch> {
  return requestWithSession(path(id, 'launch-grants'), {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
  });
}

/** Cancel with a persisted key: a retry after a lost response replays instead of racing a completion. */
export function cancelPlaytest(accountId: string, id: string): Promise<PlaytestStatus> {
  return singleFlight(`${accountId}:${id}`, async () =>
    requestWithSession<PlaytestStatus>(path(id, 'cancel'), {
      method: 'POST',
      headers: { 'Idempotency-Key': await playtestKeys.get(accountId, id, 'cancel') },
    }),
  );
}

export function heartbeatPlaytest(id: string): Promise<unknown> {
  return requestWithSession(path(id, 'heartbeat'), { method: 'POST' });
}

export function getPlaytestPackage(id: string): Promise<RuntimePackageDownload> {
  return requestWithSession(path(id, 'package'));
}

/** The playtest pin from its status; the manifest hash pins the file, revision is checked against the manifest. */
export function playtestPin(status: PlaytestStatus): PackagePin {
  return {
    releaseId: status.scenarioVersionId,
    manifestHash: status.package.manifestHash,
    buildingId: status.buildingId,
    revisionId: status.revisionId,
    runtimeVersion: APP_RUNTIME_VERSION,
    materialLibraryVersion: null,
  };
}

async function planPlaytestPackage(status: PlaytestStatus): Promise<PackagePlan> {
  return planPackageDownload(playtestPin(status), await getPlaytestPackage(status.id));
}

export type PreparedPlaytest = { manifestPath: string; scenario: unknown };

/** The pinned package when it is already verified on this device (re-hashed, never downloads). */
export async function cachedPlaytestPackage(
  status: PlaytestStatus,
): Promise<PreparedPlaytest | null> {
  if (!unityBridge.available) return null;
  const pin = playtestPin(status);
  const manifestPath = await cachedPackagePath(pin);
  return manifestPath ? { manifestPath, scenario: await readPackageScenario(pin) } : null;
}

/**
 * Prepare step: GET /package (ten-minute signed URLs, re-fetched when they expire), download, verify the manifest and
 * every SHA-256. Cancel keeps the verified files so the next prepare resumes. Never calls /start, so it never uses Trial.
 */
export async function preparePlaytestPackage(
  status: PlaytestStatus,
  options: Omit<PackageDownloadOptions, 'refresh'> = {},
): Promise<PreparedPlaytest> {
  if (!unityBridge.available) throw new Error(UNITY_UNAVAILABLE_MESSAGE);
  if (!status.launchSession) throw new Error('Phiên Mobile này không có quyền mở playtest.');
  const manifestPath = await prepareVerifiedPackage(await planPlaytestPackage(status), {
    ...options,
    refresh: () => planPlaytestPackage(status),
  });
  return { manifestPath, scenario: await readPackageScenario(playtestPin(status)) };
}

class UnityRuntimeMismatch extends Error {
  readonly code = 'RUNTIME_MISMATCH';
}

/**
 * "Bắt đầu playtest" (Created → /start, the only call that can use Trial) and "Thử mở lại" (Launching → /launch-grants):
 * checks the embedded Unity runtime first, obtains the grant with persisted keys, records the launch for this account,
 * then opens Unity. Never called by the prepare step or automatically.
 */
export async function launchPlaytest(
  status: PlaytestStatus,
  mode: TrainingMode,
  accountId: string,
  manifestPath: string,
): Promise<PlaytestLaunch> {
  if (!unityBridge.available) throw new Error(UNITY_UNAVAILABLE_MESSAGE);
  if (!status.launchSession) throw new Error('Phiên Mobile này không có quyền mở playtest.');
  const mismatch = checkUnityHandshake(await unityBridge.handshake());
  if (mismatch) throw new UnityRuntimeMismatch(mismatch);
  const grant = await acquirePlaytestGrant(
    { getStatus: getPlaytest, start: postStart, reissue: postReissue },
    playtestKeys,
    accountId,
    status,
  );
  await saveLaunch(
    status.id,
    'Playtest',
    grant.generation,
    grant.expiresAt,
    manifestPath,
    accountId,
  );
  try {
    await unityBridge.launch({
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      sessionId: status.id,
      kind: 'Playtest',
      mode,
      runtimeVersion: APP_RUNTIME_VERSION,
      manifestPath,
      resumeFromSequence: 0,
      locale: 'vi',
    });
  } catch (issue) {
    if ((issue as { code?: string } | null)?.code === 'ERR_UNITY_RUNTIME_MISMATCH') {
      await markRecovery(status.id, 'RUNTIME_MISMATCH');
      throw new UnityRuntimeMismatch(issue instanceof Error ? issue.message : String(issue));
    }
    throw issue;
  }
  return grant;
}

/** Codes after which a Launched signal can never be confirmed: the play is stopped and the playtest goes to recovery. */
const LAUNCH_FINAL = ['PLAYTEST_GRANT_STALE', 'PLAYTEST_GRANT_EXPIRED', 'PLAYTEST_TERMINAL'];

/**
 * Confirms Unity's `Launched` for playtests of `accountId` (the runtime loop ingests callbacks first). Valid when Unity
 * reported it before the grant expired (native receive time), even when this runs later. A stale or expired grant stops
 * that play and moves the playtest to recovery ("Thử mở lại"); one failing signal never blocks the others.
 */
export async function reconcilePlaytestLaunched(accountId: string): Promise<void> {
  let failure: unknown = null;
  for (const signal of await pendingLaunchedSignals()) {
    const launch = await getLaunch(signal.session_id);
    if (launch?.kind !== 'Playtest' || !launchBelongsTo(launch, accountId, false)) continue;
    const stop = async (code: string) => {
      await markLaunched(signal.native_id, signal.session_id);
      await markRecovery(signal.session_id, code);
      if ((await unityBridge.activeSession()) === signal.session_id)
        await unityBridge.abort('LaunchGrantExpired');
    };
    if (Date.parse(launch.expires_at) < (signal.received_at ?? Date.now())) {
      await stop('PLAYTEST_GRANT_EXPIRED');
      continue;
    }
    try {
      await requestWithSession(path(signal.session_id, 'launched'), {
        json: { generation: launch.generation },
      });
      await markLaunched(signal.native_id, signal.session_id);
    } catch (issue) {
      const code = problemCode(issue);
      if (code && LAUNCH_FINAL.includes(code)) await stop(code);
      else if (
        issue instanceof ApiError &&
        issue.status >= 400 &&
        issue.status < 500 &&
        issue.status !== 401
      )
        await stop(code ?? `HTTP_${issue.status}`);
      else failure ??= issue;
    }
  }
  if (failure) throw failure;
}

export type PlaytestSyncResult =
  | { kind: 'nothing' }
  | { kind: 'completed'; status: PlaytestStatus }
  | { kind: 'recovery'; code: string };

type EventsReceipt = {
  accepted: string[];
  duplicates: string[];
  conflicts: { eventId: string; code: string }[];
  acknowledgedSequence: number;
  missingRanges: { from: number; to: number }[];
};

/**
 * Sends queued events (stable IDs, ≤ 500 per batch), then the completion with the key stored when Unity's Completed was
 * persisted (a lost response replays the same key). A terminal or foreign playtest goes to recovery instead of retrying.
 */
export async function syncPlaytest(id: string): Promise<PlaytestSyncResult> {
  const recover = async (code: string): Promise<PlaytestSyncResult> => {
    await markRecovery(id, code);
    return { kind: 'recovery', code };
  };
  const finalOrRecover = async (issue: unknown): Promise<PlaytestSyncResult> => {
    const code = problemCode(issue);
    if (code === 'PLAYTEST_TERMINAL') {
      const status = await getPlaytest(id);
      if (status.status === 'Completed') {
        await markCompletion(id, 'completed');
        return { kind: 'completed', status };
      }
      return recover(`PLAYTEST_${status.status.toUpperCase()}`);
    }
    if (code === 'PLAYTEST_SESSION_MISMATCH') return recover(code);
    if (issue instanceof ApiError && (issue.status === 403 || issue.status === 404))
      return recover(`HTTP_${issue.status}`);
    throw issue;
  };
  let stalled = 0;
  for (let cycle = 0; cycle < 100; cycle++) {
    const events = await pendingEvents(id);
    if (events.length === 0) break;
    let receipt: EventsReceipt;
    try {
      receipt = await requestWithSession<EventsReceipt>(path(id, 'events:batch'), {
        json: {
          events: events.map(({ eventId, sequence, schemaVersion, type, occurredAt, payload }) => ({
            eventId,
            sequence,
            schemaVersion,
            type,
            occurredAt,
            payload,
          })),
        },
      });
    } catch (issue) {
      return finalOrRecover(issue);
    }
    await applyEventReceipt(id, receipt);
    const requeued = await requeueMissingRanges(id, receipt.missingRanges);
    const progress =
      receipt.accepted.length + receipt.duplicates.length + receipt.conflicts.length + requeued;
    if (progress === 0) {
      if (++stalled > 1) return recover('EVENTS_STALLED');
    } else stalled = 0;
  }
  if ((await pendingEvents(id)).length > 0) throw new Error('Playtest còn event chưa đồng bộ.');
  const completion = await completionFor(id);
  if (!completion || completion.state === 'completed') return { kind: 'nothing' };
  try {
    const completed = await requestWithSession<PlaytestStatus>(path(id, 'complete'), {
      headers: { 'Idempotency-Key': completion.key },
      json: {
        lastEventSequence: completion.last_sequence,
        summary: (await completionSummaryFor(id)) ?? undefined,
      },
    });
    await markCompletion(id, 'completed');
    return { kind: 'completed', status: completed };
  } catch (issue) {
    if (problemCode(issue) === 'PLAYTEST_EVENTS_INCOMPLETE') {
      // BE misses events below lastEventSequence: resend what this device has; none left means they never arrived.
      const status = await getPlaytest(id);
      const requeued = await requeueMissingRanges(
        id,
        completion.last_sequence > status.acknowledgedSequence
          ? [{ from: status.acknowledgedSequence + 1, to: completion.last_sequence }]
          : [],
      );
      if (requeued === 0) return recover('PLAYTEST_EVENTS_INCOMPLETE');
      throw issue;
    }
    return finalOrRecover(issue);
  }
}
