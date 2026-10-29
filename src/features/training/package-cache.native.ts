import { Directory, File, Paths } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { validatePackageManifest, type ContentManifest, type PackagePin } from './package-contract';
import { withPackageLock } from './package-lock';
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

/** What this device holds for a pinned package: fully verified, some files kept for resuming, or nothing. */
export type PackageStatus = 'ready' | 'partial' | 'missing';

export class PackageDownloadCancelled extends Error {
  constructor() {
    super('Đã hủy tải package. Phần đã kiểm tra được giữ lại để tải tiếp.');
    this.name = 'PackageDownloadCancelled';
  }
}

/** The package is not (or no longer) fully verified on this device; downloading again resumes from the kept files. */
export class PackageNotReady extends Error {
  constructor() {
    super('Gói nhiệm vụ trên máy chưa đầy đủ. Hãy tải lại, phần còn đúng sẽ được giữ.');
    this.name = 'PackageNotReady';
  }
}

/** A pre-launch check trusts a full verification of the same package for this long (per app process). */
const VERIFIED_TRUST_MS = 10 * 60_000;
const verified = new Map<string, { manifestPath: string; at: number }>();

const packageKey = (pin: PackagePin) => `${pin.releaseId}/${pin.manifestHash}`;

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

/**
 * Re-hashes the manifest and every file of the final folder. Never deletes or moves anything: a mismatch only means the
 * next [prepareVerifiedPackage] re-downloads the files that no longer match. Callers hold the package lock.
 */
async function verifyFinal(
  pin: PackagePin,
  signal?: AbortSignal,
): Promise<{ manifest: ContentManifest; manifestPath: string } | null> {
  const { final } = folders(pin);
  if (!final.exists) return null;
  try {
    const manifestFile = new File(final, 'manifest.json');
    if (!(await matches(manifestFile, manifestFile.size, pin.manifestHash, signal)))
      throw new Error('manifest.json');
    const manifest = await readManifest(manifestFile, pin);
    for (const entry of manifest.files)
      if (!(await matches(fileIn(final, entry.path), entry.size, entry.sha256, signal)))
        throw new Error(entry.path);
    const manifestPath = manifestPathOf(final);
    verified.set(packageKey(pin), { manifestPath, at: Date.now() });
    return { manifest, manifestPath };
  } catch (issue) {
    if (issue instanceof PackageDownloadCancelled) throw issue;
    verified.delete(packageKey(pin));
    console.warn(
      '[package-cache] cached package needs resuming:',
      issue instanceof Error ? issue.message : issue,
    );
    return null;
  }
}

/**
 * Moves one verified file from staging into the final folder (copy when the move fails), then re-checks it there. On
 * any failure the staging copy is still on disk, so the next attempt finishes without downloading it again.
 */
async function promote(from: File, to: File, size: number, digest: string, path: string) {
  to.parentDirectory.create({ intermediates: true, idempotent: true });
  try {
    await from.move(to, { overwrite: true });
  } catch {
    try {
      await from.copy(to, { overwrite: true });
    } catch (issue) {
      throw new Error(
        `Không chuyển được ${path} vào bộ nhớ máy: ${issue instanceof Error ? issue.message : String(issue)}`,
      );
    }
  }
  if (!(await matches(to, size, digest)))
    throw new Error(`Không chuyển được ${path} vào bộ nhớ máy.`);
}

/** Absolute manifest path when this exact pinned package is already verified in the cache; never downloads or deletes. */
export function cachedPackagePath(pin: PackagePin): Promise<string | null> {
  return withPackageLock(
    packageKey(pin),
    async () => (await verifyFinal(pin))?.manifestPath ?? null,
  );
}

/** Device-side state of a pinned package for lists; re-hashes the final folder, never deletes or downloads. */
export function packageStatus(pin: PackagePin): Promise<PackageStatus> {
  return withPackageLock(packageKey(pin), async () => {
    if (await verifyFinal(pin)) return 'ready';
    const { final, staging } = folders(pin);
    return final.exists || staging.exists ? 'partial' : 'missing';
  });
}

/**
 * Last check before a manifest path is handed to Unity (and before /start, so a broken package never takes a learner
 * seat or a Trial): the path must be this pin's final folder, every file must be present with its size, and either a
 * full verification of this package ran within the trust window or a fresh one passes now. Deletes nothing.
 */
export function assertPackageReady(pin: PackagePin, manifestPath: string): Promise<void> {
  return withPackageLock(packageKey(pin), async () => {
    const { final } = folders(pin);
    if (manifestPath !== manifestPathOf(final)) throw new PackageNotReady();
    const trusted = verified.get(packageKey(pin));
    if (
      trusted &&
      trusted.manifestPath === manifestPath &&
      Date.now() - trusted.at < VERIFIED_TRUST_MS
    ) {
      try {
        const manifest = await readManifest(new File(final, 'manifest.json'), pin);
        const present = manifest.files.every((entry) => {
          const file = fileIn(final, entry.path);
          return file.exists && file.size === entry.size;
        });
        if (present) return;
      } catch {
        // Falls through to the full verification below.
      }
    }
    if (!(await verifyFinal(pin))) throw new PackageNotReady();
  });
}

/**
 * The scenario document of a package that [cachedPackagePath] or [prepareVerifiedPackage] has just verified (SHA-256 pinned
 * by the manifest); null when the manifest names no scenario. Used to read `modePolicy` before choosing a mode.
 */
export function readPackageScenario(pin: PackagePin): Promise<unknown | null> {
  return withPackageLock(packageKey(pin), async () => {
    const { final } = folders(pin);
    const manifest = await readManifest(new File(final, 'manifest.json'), pin);
    if (!manifest.scenario) return null;
    const entry = manifest.files.find((file) => file.path === manifest.scenario);
    const file = fileIn(final, manifest.scenario);
    if (!entry || !(await matches(file, entry.size, entry.sha256)))
      throw new Error('scenario.json không khớp SHA-256 đã pin. Hãy tải lại package.');
    return JSON.parse(await file.text()) as unknown;
  });
}

/**
 * Makes the pinned package complete in `<manifestHash>` and returns its manifest path for Unity. Files already correct
 * in the final folder or in `<manifestHash>.partial` (left by an earlier cancel, crash or failed move) are reused; only
 * missing or corrupt files are downloaded, each verified by SHA-256 and promoted into the final folder one by one, with
 * the manifest promoted last. Cancel, app close or a failed move keep every verified file for the next attempt; staging
 * is removed only after the final folder passed a full verification. Calls for the same package run one at a time.
 */
export function prepareVerifiedPackage(
  initial: PackagePlan,
  options: PackageDownloadOptions,
): Promise<string> {
  return withPackageLock(packageKey(initial.pin), () => reconcilePackage(initial, options));
}

async function reconcilePackage(
  initial: PackagePlan,
  options: PackageDownloadOptions,
): Promise<string> {
  const { onProgress, signal } = options;
  const pin = initial.pin;
  const done = (manifestPath: string) => {
    onProgress?.({
      phase: 'ready',
      bytesDone: initial.totalBytes,
      totalBytes: initial.totalBytes,
      fileIndex: initial.fileCount,
      fileCount: initial.fileCount,
      path: null,
    });
    return manifestPath;
  };
  const cached = await verifyFinal(pin, signal);
  if (cached) return done(cached.manifestPath);

  const { final, staging } = folders(pin);
  final.create({ intermediates: true, idempotent: true });
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

  verified.delete(packageKey(pin));
  const finalManifest = new File(final, 'manifest.json');
  const stagedManifest = new File(staging, 'manifest.json');
  report('checking', 0, 'manifest.json');
  const manifestSize = plan.manifest.sizeBytes;
  const manifestInFinal = await matches(finalManifest, manifestSize, pin.manifestHash, signal);
  if (!manifestInFinal)
    await fetchVerified('manifest.json', stagedManifest, (current) => current.manifest, 0);
  bytesDone += manifestSize;
  const manifest = await readManifest(manifestInFinal ? finalManifest : stagedManifest, pin);
  crossCheckManifest(manifest, plan);

  let index = 0;
  for (const entry of manifest.files) {
    index++;
    if (signal?.aborted) throw new PackageDownloadCancelled();
    const target = fileIn(final, entry.path);
    report('checking', index, entry.path);
    if (!(await matches(target, entry.size, entry.sha256, signal))) {
      const staged = fileIn(staging, entry.path);
      await fetchVerified(entry.path, staged, (current) => current.files[entry.path], index);
      await promote(staged, target, entry.size, entry.sha256, entry.path);
    }
    bytesDone += entry.size;
  }
  if (signal?.aborted) throw new PackageDownloadCancelled();
  if (!manifestInFinal)
    await promote(stagedManifest, finalManifest, manifestSize, pin.manifestHash, 'manifest.json');

  const checked = await verifyFinal(pin, signal);
  if (!checked) throw new PackageNotReady();
  try {
    if (staging.exists) staging.delete();
  } catch (issue) {
    console.warn('[package-cache] could not remove the staging folder', issue);
  }
  report('ready', index, null);
  return checked.manifestPath;
}
