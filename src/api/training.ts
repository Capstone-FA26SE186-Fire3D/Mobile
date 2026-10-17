import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { requestWithSession } from './auth';
import { apiClient } from './client';
import { ApiError } from './types/common';
import {
  applyEventReceipt,
  completionFor,
  highestLocalSequence,
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

export type TrainingSession = {
  id: string;
  status: string;
  releaseId: string;
  buildingId: string;
  mode: string;
  runtimeVersion: string;
  acknowledgedSequence: number | null;
  package: { packageHash: string; manifestHash: string; [key: string]: unknown };
};
type StartResponse = {
  session: TrainingSession;
  launch: { sessionId: string; generation: number; expiresAt: string; launchGrant: string };
  continuation: { token: string; expiresAt: string };
};
type Range = { from: number; to: number };
type EventReceipt = {
  accepted: string[];
  duplicates: string[];
  conflicts: { eventId: string; code: string }[];
  acknowledgedSequence: number;
  missingRanges: Range[];
  status: string;
};
type CompleteResponse = {
  status: string;
  session: TrainingSession;
  acknowledgedSequence: number;
  missingRanges: Range[];
};

const continuationKey = (id: string) => `fire3d.continuation.${id}`;

export function prepareTrainingSession(
  trainingId: string,
  mode: 'Learn' | 'Guided' | 'Assessment',
  key = Crypto.randomUUID(),
): Promise<TrainingSession> {
  return requestWithSession('/api/training/sessions', {
    headers: { 'Idempotency-Key': key },
    json: { trainingId, mode, runtimeVersion: '2.0.0' },
  });
}

export async function startTrainingSession(
  id: string,
  key = Crypto.randomUUID(),
): Promise<StartResponse> {
  const response = await requestWithSession<StartResponse>(`/api/training/sessions/${id}/start`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
  });
  if (!response.launch?.launchGrant || new Date(response.launch.expiresAt).getTime() <= Date.now())
    throw new Error('Grant mở Unity đã hết hạn hoặc không hợp lệ.');
  await SecureStore.setItemAsync(continuationKey(id), response.continuation.token);
  return response;
}

/** The URL map is supplied by a BE adapter once the package download contract is published. */
export async function launchTrainingSession(
  prepared: TrainingSession,
  pin: PackagePin,
  download: PackageDownload,
  resumeFromSequence = 0,
): Promise<void> {
  if (
    !prepared.id ||
    prepared.releaseId !== pin.releaseId ||
    prepared.buildingId !== pin.buildingId ||
    prepared.package.manifestHash !== pin.manifestHash
  )
    throw new Error('Package pin không khớp phiên BE đã prepare.');
  const manifestPath = await prepareVerifiedPackage(pin, download);
  const started = await startTrainingSession(prepared.id);
  if (
    new Date(started.launch.expiresAt).getTime() <= Date.now() ||
    started.session.id !== prepared.id ||
    started.session.runtimeVersion !== '2.0.0'
  )
    throw new Error('Grant hoặc runtime của phiên không hợp lệ.');
  await saveLaunch(
    prepared.id,
    'Training',
    started.launch.generation,
    started.launch.expiresAt,
    manifestPath,
  );
  await unityBridge.launch({
    protocolVersion: '1',
    sessionId: prepared.id,
    kind: 'Training',
    mode: prepared.mode,
    runtimeVersion: '2.0.0',
    manifestPath,
    resumeFromSequence,
    locale: 'vi',
  });
}

export async function reconcileUnityLaunched(): Promise<void> {
  await ingestUnityCallbacks();
  for (const signal of await pendingLaunchedSignals()) {
    const launch = await getLaunch(signal.session_id);
    if (launch?.kind === 'Playtest') continue;
    if (!launch || new Date(launch.expires_at).getTime() <= Date.now()) {
      await unityBridge.abort('Launch grant expired');
      throw new Error('Unity đã mở sau khi grant hết hạn.');
    }
    await requestWithSession(`/api/training/sessions/${signal.session_id}/launched`, {
      json: { generation: launch.generation },
    });
    await markLaunched(signal.native_id, signal.session_id);
  }
}

async function syncRequest<T>(
  id: string,
  suffix: string,
  options: { method: 'POST'; json?: unknown; headers?: Record<string, string> },
): Promise<T> {
  const path = `/api/training/sessions/${id}/${suffix}`;
  try {
    return await requestWithSession<T>(path, options);
  } catch (issue) {
    if (!(issue instanceof ApiError) || issue.status !== 401) throw issue;
    const token = await SecureStore.getItemAsync(continuationKey(id));
    if (!token) throw issue;
    return apiClient.request<T>(path, { ...options, accessToken: token });
  }
}

export async function syncTrainingSession(id: string): Promise<CompleteResponse | null> {
  await reconcileUnityLaunched();
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
  const session = await requestWithSession<TrainingSession>(`/api/training/sessions/${id}`);
  return Math.max(session.acknowledgedSequence ?? 0, await highestLocalSequence(id));
}
