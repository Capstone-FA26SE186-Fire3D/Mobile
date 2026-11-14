import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
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
    super('Đã hủy tải gói. Phần đã kiểm tra được giữ lại để tải tiếp.');
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

/** 1 MiB per native read: file.stream() reads 1 KiB per pull (~200,000 reads for 200 MB) and keeps its handle open. */
const HASH_CHUNK_BYTES = 1 << 20;

/**
 * Files up to this size are read in one native call and hashed by the platform's SHA-256 (expo-crypto), far faster than
 * SHA-256 in JS on Hermes, which kept the CPU at 100% for a whole download (#83). Larger files keep the chunked JS hash so
 * memory stays bounded.
 */
const NATIVE_HASH_MAX_BYTES = 48 << 20;
let nativeDigest = true;

async function hashFile(file: File, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new PackageDownloadCancelled();
  if (nativeDigest && file.size <= NATIVE_HASH_MAX_BYTES) {
    try {
      const bytes = await file.bytes();
      if (signal?.aborted) throw new PackageDownloadCancelled();
      return bytesToHex(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes)));
    } catch (issue) {
      if (issue instanceof PackageDownloadCancelled) throw issue;
      nativeDigest = false;
      console.warn('[package-cache] native SHA-256 unavailable, hashing in JS', issue);
    }
  }
  return hashFileInJs(file, signal);
}

async function hashFileInJs(file: File, signal?: AbortSignal): Promise<string> {
  const hash = sha256.create();
  // ReadOnly explicitly: open() defaults to ReadWrite for file:// paths.
  const handle = file.open(FileMode.ReadOnly);
  try {
    while (true) {
      if (signal?.aborted) throw new PackageDownloadCancelled();
      const chunk = handle.readBytes(HASH_CHUNK_BYTES);
      if (chunk.length === 0) break;
      hash.update(chunk);
      // Yield between chunks so the UI stays responsive and an abort is seen.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    handle.close();
  }
  return bytesToHex(hash.digest());
}

/**
 * Hashes already computed, by file URI: `size:mtime:sha256`. A file whose size and modification time are unchanged is not
 * read again, so each file is hashed once (after download) instead of 3–4 times, and reopening the app shows progress at
 * once instead of re-hashing the whole package first (#83). Kept in a small JSON file next to the packages.
 */
const MEMO_NAME = 'verified-hashes.json';
let memo: Map<string, string> | null = null;

function memoFile(): File {
  return new File(Paths.document, 'fire3d-packages', MEMO_NAME);
}

async function hashMemo(): Promise<Map<string, string>> {
  if (memo) return memo;
  memo = new Map();
  try {
    const file = memoFile();
    if (file.exists) {
      const saved = JSON.parse(await file.text()) as Record<string, unknown>;
      for (const [uri, value] of Object.entries(saved))
        if (typeof value === 'string' && new File(uri).exists) memo.set(uri, value);
    }
  } catch (issue) {
    console.warn('[package-cache] ignoring unreadable hash memo', issue);
  }
  return memo;
}

function saveMemo() {
  if (!memo) return;
  try {
    const file = memoFile();
    file.parentDirectory.create({ intermediates: true, idempotent: true });
    file.write(JSON.stringify(Object.fromEntries(memo)));
  } catch (issue) {
    console.warn('[package-cache] could not save the hash memo', issue);
  }
}

/** `size:mtime` of a file, or null when the platform gives no modification time (then the file is always hashed). */
function stampOf(file: File): string | null {
  const mtime = file.lastModified ?? file.modificationTime;
  return typeof mtime === 'number' && Number.isFinite(mtime) && mtime > 0 ? `${file.size}:${mtime}` : null;
}

async function matches(file: File, size: number, expected: string, signal?: AbortSignal) {
  if (!file.exists || file.size !== size) return false;
  const stamp = stampOf(file);
  const known = stamp ? (await hashMemo()).get(file.uri) : undefined;
  if (stamp && known?.startsWith(`${stamp}:`)) return known === `${stamp}:${expected}`;
  const actual = await hashFile(file, signal);
  if (stamp) {
    (await hashMemo()).set(file.uri, `${stamp}:${actual}`);
    saveMemo();
  }
  return actual === expected;
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
  // A move keeps size and modification time, so the hash computed in staging carries over and the file is not re-read.
  const store = await hashMemo();
  const fromUri = from.uri;
  const carried = store.get(fromUri);
  try {
    await from.move(to, { overwrite: true });
    if (carried) {
      store.delete(fromUri);
      store.set(to.uri, carried);
    }
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

/**
 * Device-side state of a pinned package for lists; re-hashes the final folder, never deletes or downloads. `signal` stops
 * the hashing (rejects with PackageDownloadCancelled) so a screen that is left does not hold the package lock.
 */
export function packageStatus(pin: PackagePin, signal?: AbortSignal): Promise<PackageStatus> {
  return withPackageLock(packageKey(pin), async () => {
    if (await verifyFinal(pin, signal)) return 'ready';
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
