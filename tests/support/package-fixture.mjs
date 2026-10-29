// A small Unity-shaped package with real SHA-256 digests, its pin, the BE signed-URL plan and helpers that place files
// in the fake file system (see fakes/expo-file-system.mjs) as the final or the staging (`.partial`) folder.
import { createHash } from 'node:crypto';
import { APP_RUNTIME_VERSION } from '../../src/features/training/runtime-version.ts';
import { planPackageDownload } from '../../src/features/training/session-contract.ts';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encode = (text) => new TextEncoder().encode(text);
const BASE = 'https://s3.example.test/p';

export function buildPackage({
  releaseId = '33333333-3333-4333-8333-333333333333',
  buildingId = '11111111-1111-4111-8111-111111111111',
  revisionId = null,
  seed = 'a',
} = {}) {
  const contents = {
    'floors/L1.bundle': encode(`floor-${seed}`.repeat(40)),
    'building_metadata.json': encode(JSON.stringify({ floors: ['L1'], seed })),
    'scenario.json': encode(JSON.stringify({ modePolicy: { allowed: ['Guided'] }, seed })),
  };
  const manifest = {
    schemaVersion: 'fet3d.package/1',
    jobId: '66666666-6666-4666-8666-666666666666',
    buildTarget: 'Android',
    protocolVersion: '1',
    manifestSchemaVersion: '1',
    runtimeVersion: '2.0.0',
    minRuntimeVersion: '2.0.0',
    requiredCapabilities: ['fire.v1'],
    unityVersion: '6000.6.6f1',
    materialLibraryVersion: 'lib-3',
    revisionId: revisionId ?? 'rev-7',
    lightingScenarios: ['normal'],
    floors: [{ id: 'L1', bundle: 'floors/L1.bundle', scene: 'L1', elevation: 0 }],
    files: Object.entries(contents).map(([path, bytes]) => ({
      path,
      sha256: sha(bytes),
      size: bytes.length,
    })),
    metadata: 'building_metadata.json',
    scenario: 'scenario.json',
  };
  const manifestBytes = encode(JSON.stringify(manifest));
  const manifestHash = sha(manifestBytes);
  const pin = {
    releaseId,
    manifestHash,
    buildingId,
    revisionId,
    runtimeVersion: APP_RUNTIME_VERSION,
    materialLibraryVersion: null,
  };
  const all = { 'manifest.json': manifestBytes, ...contents };
  const response = (expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()) => ({
    schemaVersion: 'fet3d.package/1',
    manifest: {
      url: `${BASE}/${releaseId}/manifest.json?sig=1`,
      sha256: manifestHash,
      sizeBytes: manifestBytes.length,
    },
    files: manifest.files.map((file) => ({
      path: file.path,
      url: `${BASE}/${releaseId}/${file.path}?sig=1`,
      sha256: file.sha256,
      sizeBytes: file.size,
    })),
    floors: manifest.floors,
    runtimeVersion: '2.0.0',
    buildTarget: 'Android',
    expiresAt,
  });
  const folder = (staging) =>
    `/documents/fire3d-packages/${releaseId}/${manifestHash}${staging ? '.partial' : ''}`;
  return {
    pin,
    manifestHash,
    paths: Object.keys(all),
    bytes: all,
    plan: () => planPackageDownload(pin, response()),
    urlOf: (path) => `${BASE}/${releaseId}/${path}`,
    folder,
    manifestPath: `${folder(false)}/manifest.json`,
    /** Serves every file of this package from the fake S3. */
    serve(fs) {
      for (const [path, bytes] of Object.entries(all))
        fs.downloads.set(`${BASE}/${releaseId}/${path}`, bytes);
    },
    /** Writes `paths` (default: all) into the final or staging folder; `corrupt` paths get wrong bytes. */
    seed(fs, { staging = false, paths = Object.keys(all), corrupt = [] } = {}) {
      const root = folder(staging);
      for (const path of paths) {
        const full = `${root}/${path}`;
        let dir = full.slice(0, full.lastIndexOf('/'));
        const missing = [];
        while (!fs.dirs.has(dir)) {
          missing.push(dir);
          dir = dir.slice(0, dir.lastIndexOf('/'));
        }
        for (const item of missing) fs.dirs.add(item);
        const bytes = corrupt.includes(path) ? encode('broken') : all[path];
        fs.files.set(full, bytes);
      }
    },
  };
}
