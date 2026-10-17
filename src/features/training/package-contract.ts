export type ManifestFile = { path: string; sha256: string; size: number };
export type ContentManifest = {
  schemaVersion: string;
  runtimeVersion: string;
  buildTarget: string;
  unityVersion: string;
  materialLibraryVersion: string;
  buildingId: string;
  revisionId: string;
  floors: { floorId: string; bundle: string; lightingBundle?: string | null; scene: string }[];
  files: ManifestFile[];
  metadata: string;
  scenario: string;
};

export type PackagePin = {
  releaseId: string;
  manifestHash: string;
  buildingId: string;
  revisionId: string;
  runtimeVersion: '2.0.0';
  materialLibraryVersion: string;
};

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_PATH = /^[A-Za-z0-9_.\/-]+$/;

function safePath(path: string): boolean {
  return (
    SAFE_PATH.test(path) &&
    !path.startsWith('/') &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

export function validatePackageManifest(value: unknown, pin: PackagePin): ContentManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Manifest không hợp lệ.');
  const manifest = value as ContentManifest;
  if (
    !SHA256.test(pin.manifestHash) ||
    !pin.releaseId ||
    !pin.materialLibraryVersion ||
    !pin.buildingId ||
    !pin.revisionId
  )
    throw new Error('BE chưa cung cấp đủ pin package và manifest.');
  if (
    manifest.schemaVersion !== 'fet3d.package/1' ||
    manifest.buildTarget !== 'Android' ||
    manifest.runtimeVersion !== pin.runtimeVersion ||
    manifest.materialLibraryVersion !== pin.materialLibraryVersion ||
    manifest.buildingId !== pin.buildingId ||
    manifest.revisionId !== pin.revisionId
  )
    throw new Error('Manifest không khớp schema, Android target hoặc provenance đã pin.');
  if (
    !manifest.unityVersion ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    !Array.isArray(manifest.floors) ||
    manifest.floors.length === 0
  )
    throw new Error('Manifest thiếu danh sách file hoặc tầng.');
  const paths = new Set<string>();
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      !safePath(file.path) ||
      !SHA256.test(file.sha256) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      paths.has(file.path)
    )
      throw new Error('Manifest chứa file không hợp lệ hoặc trùng đường dẫn.');
    paths.add(file.path);
  }
  if (
    !paths.has(manifest.metadata) ||
    !paths.has(manifest.scenario) ||
    manifest.floors.some(
      (floor) =>
        !floor.floorId ||
        !paths.has(floor.bundle) ||
        (floor.lightingBundle && !paths.has(floor.lightingBundle)),
    )
  )
    throw new Error('Manifest tham chiếu file chưa được pin SHA-256.');
  return manifest;
}
