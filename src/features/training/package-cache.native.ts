import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { validatePackageManifest, type ContentManifest, type PackagePin } from './package-contract';

export type PackageDownload = { manifestUrl: string; fileUrls: Record<string, string> };

function requireHttps(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname)
    throw new Error('URL tải package phải dùng HTTPS.');
  return url;
}

async function hashFile(file: File): Promise<string> {
  const hash = sha256.create();
  const reader = file.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return bytesToHex(hash.digest());
}

async function verifyDownloadedFiles(
  folder: Directory,
  manifestFile: File,
  pin: PackagePin,
): Promise<void> {
  if (!manifestFile.exists || (await hashFile(manifestFile)) !== pin.manifestHash)
    throw new Error('Manifest trong cache không khớp SHA-256 đã pin.');
  const manifest = validatePackageManifest(
    JSON.parse(await manifestFile.text()) as ContentManifest,
    pin,
  );
  for (const entry of manifest.files) {
    const file = new File(folder, ...entry.path.split('/'));
    if (!file.exists || file.size !== entry.size || (await hashFile(file)) !== entry.sha256)
      throw new Error(`File package trong cache sai size hoặc SHA-256: ${entry.path}.`);
  }
}

/** A package becomes visible to Unity only after every manifest entry is verified. */
export async function prepareVerifiedPackage(
  pin: PackagePin,
  download: PackageDownload,
): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(pin.manifestHash) || !/^[0-9a-f-]{36}$/i.test(pin.releaseId))
    throw new Error('Release hoặc manifest hash chưa được BE pin hợp lệ.');
  const root = new Directory(Paths.document, 'fire3d-packages');
  root.create({ intermediates: true, idempotent: true });
  const release = new Directory(root, pin.releaseId);
  release.create({ intermediates: true, idempotent: true });
  const final = new Directory(release, pin.manifestHash);
  const cachedManifest = new File(final, 'manifest.json');
  if (final.exists) {
    await verifyDownloadedFiles(final, cachedManifest, pin);
    return decodeURIComponent(new URL(cachedManifest.uri).pathname);
  }
  const staging = new Directory(release, `pending-${Crypto.randomUUID()}`);
  staging.create();
  try {
    const manifestFile = await File.downloadFileAsync(
      requireHttps(download.manifestUrl),
      new File(staging, 'manifest.json'),
    );
    if ((await hashFile(manifestFile)) !== pin.manifestHash)
      throw new Error('Manifest SHA-256 không khớp BE.');
    const manifest = validatePackageManifest(
      JSON.parse(await manifestFile.text()) as ContentManifest,
      pin,
    );
    for (const entry of manifest.files) {
      const source = download.fileUrls[entry.path];
      if (!source) throw new Error(`BE chưa cấp URL tải cho ${entry.path}.`);
      const parts = entry.path.split('/');
      const parent = parts.length > 1 ? new Directory(staging, ...parts.slice(0, -1)) : staging;
      parent.create({ intermediates: true, idempotent: true });
      const file = await File.downloadFileAsync(
        requireHttps(source),
        new File(parent, parts.at(-1)!),
      );
      if (file.size !== entry.size || (await hashFile(file)) !== entry.sha256)
        throw new Error(`File package sai size hoặc SHA-256: ${entry.path}.`);
    }
    await staging.move(final);
    return decodeURIComponent(new URL(cachedManifest.uri).pathname);
  } catch (issue) {
    if (staging.exists) staging.delete();
    throw issue;
  }
}
