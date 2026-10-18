import { Directory, File, Paths } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { validatePackageManifest, type ContentManifest, type PackagePin } from './package-contract';
import {
  crossCheckManifest,
  looksLikeExpiredUrl,
  urlsExpireSoon,
  type PackagePlan,
} from './session-contract';

export type PackageProgress = {
  phase: 'checking' | 'downloading' | 'verifying' | 'ready';
  bytesDone: number;
  totalBytes: number;
  fileIndex: number;
  fileCount: number;
  path: string | null;
};

export type PackageDownloadOptions = {
  onProgress?: (progress: PackageProgress) => void;
  signal?: AbortSignal;
  /** Called when signed URLs expired or answered 403; must re-fetch the package endpoint and re-plan. */
  refresh: () => Promise<PackagePlan>;
};

export class PackageDownloadCancelled extends Error {
  constructor() {
    super('Đã hủy tải package. Phần đã kiểm tra được giữ lại để tải tiếp.');
    this.name = 'PackageDownloadCancelled';
  }
}

async function hashFile(file: File, signal?: AbortSignal): Promise<string> {
  const hash = sha256.create();
  const reader = file.stream().getReader();
  try {
    while (true) {
      if (signal?.aborted) throw new PackageDownloadCancelled();
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return bytesToHex(hash.digest());
}

async function matches(file: File, size: number, digest: string, signal?: AbortSignal) {
  return file.exists && file.size === size && (await hashFile(file, signal)) === digest;
}

function fileIn(folder: Directory, path: string): File {
  return new File(folder, ...path.split('/'));
}

function manifestPathOf(folder: Directory): string {
  return decodeURIComponent(new URL(new File(folder, 'manifest.json').uri).pathname);
}

async function readManifest(file: File, pin: PackagePin): Promise<ContentManifest> {
  return validatePackageManifest(JSON.parse(await file.text()) as unknown, pin);
}

function folders(pin: PackagePin) {
  if (!/^[a-f0-9]{64}$/.test(pin.manifestHash) || !/^[0-9a-f-]{36}$/i.test(pin.releaseId))
    throw new Error('Release hoặc manifest hash chưa được BE pin hợp lệ.');
  const root = new Directory(Paths.document, 'fire3d-packages');
  root.create({ intermediates: true, idempotent: true });
  const release = new Directory(root, pin.releaseId);
  release.create({ intermediates: true, idempotent: true });
  return {
    final: new Directory(release, pin.manifestHash),
    staging: new Directory(release, `${pin.manifestHash}.partial`),
  };
}

/** Absolute manifest path when this exact pinned package is already verified in the cache; never downloads. */
export async function cachedPackagePath(pin: PackagePin): Promise<string | null> {
  const { final } = folders(pin);
  if (!final.exists) return null;
  try {
    const manifestFile = new File(final, 'manifest.json');
    if (!(await matches(manifestFile, manifestFile.size, pin.manifestHash))) throw new Error();
    const manifest = await readManifest(manifestFile, pin);
    for (const entry of manifest.files)
      if (!(await matches(fileIn(final, entry.path), entry.size, entry.sha256)))
        throw new Error(entry.path);
    return manifestPathOf(final);
  } catch {
    final.delete();
    return null;
  }
}

/**
 * Downloads into `<manifestHash>.partial`, verifying SHA-256 per file, and exposes the package to Unity only after every
 * manifest entry is verified. Cancel keeps verified files so the next attempt resumes; expired URLs are re-fetched.
 */
export async function prepareVerifiedPackage(
  initial: PackagePlan,
  options: PackageDownloadOptions,
): Promise<string> {
  const { onProgress, signal } = options;
  const pin = initial.pin;
  const cached = await cachedPackagePath(pin);
  if (cached) {
    onProgress?.({
      phase: 'ready',
      bytesDone: initial.totalBytes,
      totalBytes: initial.totalBytes,
      fileIndex: initial.fileCount,
      fileCount: initial.fileCount,
      path: null,
    });
    return cached;
  }
  const { final, staging } = folders(pin);
  staging.create({ intermediates: true, idempotent: true });
  let plan = initial;
  let refreshes = 0;
  let bytesDone = 0;
  const report = (
    phase: PackageProgress['phase'],
    fileIndex: number,
    path: string | null,
    current = 0,
  ) =>
    onProgress?.({
      phase,
      bytesDone: Math.min(plan.totalBytes, bytesDone + current),
      totalBytes: plan.totalBytes,
      fileIndex,
      fileCount: plan.fileCount,
      path,
    });

  async function fetchVerified(
    path: string,
    target: File,
    pick: (current: PackagePlan) => { url: string; sha256: string; sizeBytes: number },
    fileIndex: number,
  ): Promise<void> {
    while (true) {
      if (signal?.aborted) throw new PackageDownloadCancelled();
      report('checking', fileIndex, path);
      const expected = pick(plan);
      if (await matches(target, expected.sizeBytes, expected.sha256, signal)) return;
      if (urlsExpireSoon(plan)) {
        if (++refreshes > 5) throw new Error('BE liên tục cấp URL tải đã hết hạn.');
        plan = await options.refresh();
        continue;
      }
      try {
        const parent = target.parentDirectory;
        parent.create({ intermediates: true, idempotent: true });
        await File.downloadFileAsync(pick(plan).url, target, {
          idempotent: true,
          signal,
          onProgress: ({ bytesWritten }) => report('downloading', fileIndex, path, bytesWritten),
        });
      } catch (issue) {
        if (signal?.aborted || (issue instanceof Error && issue.name === 'AbortError'))
          throw new PackageDownloadCancelled();
        if (looksLikeExpiredUrl(issue) && refreshes < 5) {
          refreshes++;
          plan = await options.refresh();
          continue;
        }
        throw new Error(
          `Không tải được ${path}: ${issue instanceof Error ? issue.message : String(issue)}`,
        );
      }
      report('verifying', fileIndex, path, expected.sizeBytes);
      if (await matches(target, expected.sizeBytes, expected.sha256, signal)) return;
      if (target.exists) target.delete();
      throw new Error(`File package sai kích thước hoặc SHA-256: ${path}.`);
    }
  }

  const manifestFile = new File(staging, 'manifest.json');
  await fetchVerified('manifest.json', manifestFile, (current) => current.manifest, 0);
  bytesDone += plan.manifest.sizeBytes;
  const manifest = await readManifest(manifestFile, pin);
  crossCheckManifest(manifest, plan);
  let index = 0;
  for (const entry of manifest.files) {
    index++;
    await fetchVerified(
      entry.path,
      fileIn(staging, entry.path),
      (current) => current.files[entry.path],
      index,
    );
    bytesDone += entry.size;
  }
  if (signal?.aborted) throw new PackageDownloadCancelled();
  if (final.exists) final.delete();
  await staging.move(final);
  report('ready', index, null);
  return manifestPathOf(final);
}
