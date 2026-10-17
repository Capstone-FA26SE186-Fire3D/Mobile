import * as Crypto from 'expo-crypto';
import { requestWithSession } from './auth';
import {
  applyEventReceipt,
  completionFor,
  completionSummaryFor,
  ingestUnityCallbacks,
  markCompletion,
  markLaunched,
  pendingEvents,
  pendingLaunchedSignals,
  requeueMissingRanges,
  getLaunch,
  saveLaunch,
} from '@/features/training/event-queue.native';
import {
  prepareVerifiedPackage,
  type PackageDownload,
} from '@/features/training/package-cache.native';
import type { PackagePin } from '@/features/training/package-contract';
import { unityBridge } from '@/features/training/unity-bridge.native';

export type PlaytestStatus = {
  id: string;
  buildingId: string;
  revisionId: string;
  scenarioVersionId: string;
  status: 'Created' | 'Launching' | 'Running' | 'Completed' | 'Cancelled';
  runtimeVersion: string | null;
  package: { packageHash: string; manifestHash: string; buildTarget: string };
  grant: { generation: number; expiresAt: string } | null;
  acknowledgedSequence: number;
  boundToMobile: boolean;
  launchSession: boolean;
  recovery: { canStart: boolean; canReissueGrant: boolean; canSync: boolean; canCancel: boolean };
  completion: { lastEventSequence: number; summary: unknown } | null;
};

export type PlaytestLaunch = {
  playtestId: string;
  packageHash: string;
  manifestHash: string;
  runtimeVersion: string;
  expiresAt: string;
  generation: number;
  launchGrant: string;
};

export function redeemPlaytestHandoff(code: string): Promise<PlaytestStatus> {
  return requestWithSession('/api/playtests/handoffs/redeem', { json: { code } });
}

export function getPlaytest(id: string): Promise<PlaytestStatus> {
  return requestWithSession(`/api/playtests/${encodeURIComponent(id)}`);
}

export function startPlaytest(id: string, key = Crypto.randomUUID()): Promise<PlaytestLaunch> {
  return requestWithSession(`/api/playtests/${encodeURIComponent(id)}/start`, {
    headers: { 'Idempotency-Key': key },
    json: { runtimeVersion: '2.0.0' },
  });
}

export function reissuePlaytestGrant(
  id: string,
  key = Crypto.randomUUID(),
): Promise<PlaytestLaunch> {
  return requestWithSession(`/api/playtests/${encodeURIComponent(id)}/launch-grants`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
  });
}

export function cancelPlaytest(id: string, key = Crypto.randomUUID()): Promise<PlaytestStatus> {
  return requestWithSession(`/api/playtests/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
  });
}

/** Package sources and material-library pin must come from BE before this can be called. */
export async function launchPlaytest(
  status: PlaytestStatus,
  pin: PackagePin,
  download: PackageDownload,
  mode: 'Learn' | 'Guided' | 'Assessment',
): Promise<void> {
  if (
    !status.launchSession ||
    pin.releaseId !== status.scenarioVersionId ||
    pin.buildingId !== status.buildingId ||
    pin.revisionId !== status.revisionId ||
    pin.manifestHash !== status.package.manifestHash
  )
    throw new Error(
      'Playtest package không khớp pin của BE hoặc phiên Mobile không có quyền launch.',
    );
  const manifestPath = await prepareVerifiedPackage(pin, download);
  const grant =
    status.status === 'Created' && status.recovery.canStart
      ? await startPlaytest(status.id)
      : status.status === 'Launching' && status.recovery.canReissueGrant
        ? await reissuePlaytestGrant(status.id)
        : null;
  if (
    !grant?.launchGrant ||
    grant.playtestId !== status.id ||
    grant.manifestHash !== pin.manifestHash ||
    grant.runtimeVersion !== '2.0.0' ||
    new Date(grant.expiresAt).getTime() <= Date.now()
  )
    throw new Error('Grant playtest không hợp lệ hoặc đã hết hạn.');
  await saveLaunch(status.id, 'Playtest', grant.generation, grant.expiresAt, manifestPath);
  await unityBridge.launch({
    protocolVersion: '1',
    sessionId: status.id,
    kind: 'Playtest',
    mode,
    runtimeVersion: '2.0.0',
    manifestPath,
    resumeFromSequence: status.acknowledgedSequence,
    locale: 'vi',
  });
}

export async function reconcilePlaytestLaunched(): Promise<void> {
  await ingestUnityCallbacks();
  for (const signal of await pendingLaunchedSignals()) {
    const launch = await getLaunch(signal.session_id);
    if (launch?.kind !== 'Playtest') continue;
    if (new Date(launch.expires_at).getTime() <= Date.now()) {
      await unityBridge.abort('Playtest grant expired');
      throw new Error('Grant playtest đã hết hạn trước callback Launched.');
    }
    await requestWithSession(`/api/playtests/${encodeURIComponent(signal.session_id)}/launched`, {
      json: { generation: launch.generation },
    });
    await markLaunched(signal.native_id, signal.session_id);
  }
}

export async function syncPlaytest(id: string): Promise<PlaytestStatus | null> {
  await reconcilePlaytestLaunched();
  for (let cycle = 0; cycle < 100; cycle++) {
    const events = await pendingEvents(id);
    if (events.length === 0) break;
    const receipt = await requestWithSession<{
      accepted: string[];
      duplicates: string[];
      conflicts: { eventId: string; code: string }[];
      missingRanges: { from: number; to: number }[];
    }>(`/api/playtests/${encodeURIComponent(id)}/events:batch`, {
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
    await applyEventReceipt(id, receipt);
    await requeueMissingRanges(id, receipt.missingRanges);
  }
  if ((await pendingEvents(id)).length > 0) throw new Error('Playtest còn event chưa đồng bộ.');
  const completion = await completionFor(id);
  if (!completion || completion.state === 'completed') return null;
  const status = await getPlaytest(id);
  if (!status.launchSession || !status.recovery.canSync)
    throw new Error('Phiên Mobile này không được hoàn tất playtest.');
  const completed = await requestWithSession<PlaytestStatus>(
    `/api/playtests/${encodeURIComponent(id)}/complete`,
    {
      headers: { 'Idempotency-Key': completion.key },
      json: {
        lastEventSequence: completion.last_sequence,
        summary: await completionSummaryFor(id),
      },
    },
  );
  await markCompletion(id, 'completed');
  return completed;
}
