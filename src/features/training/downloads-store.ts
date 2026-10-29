import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PackagePin } from './package-contract';
import { withPackageLock } from './package-lock';
import { APP_RUNTIME_VERSION } from './runtime-version';

/**
 * A training whose package was downloaded and verified on this device, per account ("Bài đã tải"). It only remembers
 * how to open the training again (Building QR token, ids) and which package was verified; access is always checked
 * again online. Never stored: signed S3 URLs, participation codes, launch grants or session tokens.
 */
export type DownloadRecord = {
  trainingId: string;
  trainingName: string;
  buildingId: string;
  buildingName: string;
  /** The Building QR token the training was opened with; replay resolves it again through BE. */
  qrToken: string;
  releaseId: string;
  manifestHash: string;
  runtimeVersion: string;
  savedAt: string;
};

type DownloadsDocument = { version: 1; items: DownloadRecord[] };

const PREFIX = 'fire3d.training.downloads.v1';
const keyOf = (accountId: string) => `${PREFIX}.${accountId}`;

const TEXT_FIELDS = [
  'trainingId',
  'trainingName',
  'buildingId',
  'buildingName',
  'qrToken',
  'releaseId',
  'manifestHash',
  'runtimeVersion',
  'savedAt',
] as const;

function isRecord(value: unknown): value is DownloadRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return TEXT_FIELDS.every((field) => typeof item[field] === 'string' && item[field] !== '');
}

function parse(raw: string | null): DownloadRecord[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as Partial<DownloadsDocument>;
    return value?.version === 1 && Array.isArray(value.items) ? value.items.filter(isRecord) : [];
  } catch {
    return [];
  }
}

/** Newest first. Empty for an unknown, corrupt or other-version document. */
export async function listDownloads(accountId: string): Promise<DownloadRecord[]> {
  return parse(await AsyncStorage.getItem(keyOf(accountId)));
}

export async function readDownload(
  accountId: string,
  trainingId: string,
): Promise<DownloadRecord | null> {
  return (await listDownloads(accountId)).find((item) => item.trainingId === trainingId) ?? null;
}

function update(accountId: string, change: (items: DownloadRecord[]) => DownloadRecord[]) {
  return withPackageLock(`downloads:${accountId}`, async () => {
    const items = change(await listDownloads(accountId));
    const document: DownloadsDocument = { version: 1, items };
    await AsyncStorage.setItem(keyOf(accountId), JSON.stringify(document));
  });
}

/** Adds or replaces the record of this training (one per training) and moves it to the front. */
export function upsertDownload(accountId: string, record: DownloadRecord): Promise<void> {
  if (!isRecord(record)) return Promise.reject(new Error('Thiếu thông tin bài đã tải.'));
  return update(accountId, (items) => [
    record,
    ...items.filter((item) => item.trainingId !== record.trainingId),
  ]);
}

export function removeDownload(accountId: string, trainingId: string): Promise<void> {
  return update(accountId, (items) => items.filter((item) => item.trainingId !== trainingId));
}

/** The package pin of a record, to check what is still on the device. */
export function pinOfRecord(record: DownloadRecord): PackagePin {
  return {
    releaseId: record.releaseId,
    manifestHash: record.manifestHash,
    buildingId: record.buildingId,
    revisionId: null,
    runtimeVersion: APP_RUNTIME_VERSION,
    materialLibraryVersion: null,
  };
}

/** The Building now publishes another release of this training than the one downloaded. */
export function isNewerRelease(record: DownloadRecord, training: { releaseId: string }): boolean {
  return training.releaseId !== record.releaseId;
}
