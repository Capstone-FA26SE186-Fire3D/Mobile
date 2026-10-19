import {
  APP_RUNTIME_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  MANIFEST_SCHEMA_VERSION,
} from './runtime-version.ts';

export { APP_RUNTIME_VERSION };
export const PACKAGE_SCHEMA = 'fet3d.package/1';

export type ManifestFile = { path: string; sha256: string; size: number };
export type ManifestFloor = {
  id?: string;
  bundle: string;
  lightingBundle?: string | null;
  scene?: string;
};
/**
 * manifest.json written by the Unity build worker (BE contracts/package/v1/manifest.schema.json and Unity
 * `ContentManifest`). `revisionId`, `metadata` and `scenario` are optional in the BE schema; when present they are checked.
 */
export type ContentManifest = {
  schemaVersion: string;
  buildTarget: string;
  protocolVersion?: string;
  manifestSchemaVersion?: string;
  runtimeVersion: string;
  minRuntimeVersion?: string;
  requiredCapabilities?: string[];
  unityVersion: string;
  materialLibraryVersion: string;
  revisionId?: string | null;
  buildingId?: string | null;
  floors: ManifestFloor[];
  files: ManifestFile[];
  metadata?: string | null;
  scenario?: string | null;
};

/**
 * What the backend pinned for this preparation/playtest. The manifest file itself is pinned by `manifestHash`, so fields the
 * backend does not expose (revision, material library) are `null` and taken from the hash-verified manifest instead.
 */
export type PackagePin = {
  releaseId: string;
  manifestHash: string;
  buildingId: string;
  revisionId: string | null;
  runtimeVersion: typeof APP_RUNTIME_VERSION;
  materialLibraryVersion: string | null;
};

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

export function isSafePackagePath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    path.length <= 200 &&
    SAFE_PATH.test(path) &&
    path !== 'manifest.json' &&
    path.split('/').every((part) => part !== '.' && part !== '..')
  );
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function semver(value: string): [number, number, number] | null {
  const match = SEMVER.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** -1, 0 or 1; throws when either side is not a three-part version. */
export function compareRuntimeVersions(left: string, right: string): number {
  const a = semver(left);
  const b = semver(right);
  if (!a || !b) throw new Error('Runtime version phải có dạng major.minor.patch.');
  for (let index = 0; index < 3; index++)
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  return 0;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function validatePackageManifest(value: unknown, pin: PackagePin): ContentManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Manifest không hợp lệ.');
  const manifest = value as ContentManifest;
  if (!isSha256(pin.manifestHash) || !pin.releaseId || !pin.buildingId)
    throw new Error('BE chưa cung cấp đủ pin package và manifest.');
  if (
    manifest.schemaVersion !== PACKAGE_SCHEMA ||
    manifest.buildTarget !== 'Android' ||
    (manifest.protocolVersion !== undefined &&
      manifest.protocolVersion !== BRIDGE_PROTOCOL_VERSION) ||
    (manifest.manifestSchemaVersion !== undefined &&
      manifest.manifestSchemaVersion !== MANIFEST_SCHEMA_VERSION)
  )
    throw new Error(
      'Manifest không đúng schema fet3d.package/1, protocol "1" hoặc target Android.',
    );
  if (
    !text(manifest.runtimeVersion) ||
    !semver(manifest.runtimeVersion) ||
    semver(manifest.runtimeVersion)![0] !== semver(pin.runtimeVersion)![0] ||
    (manifest.minRuntimeVersion !== undefined &&
      (!text(manifest.minRuntimeVersion) ||
        compareRuntimeVersions(manifest.minRuntimeVersion, pin.runtimeVersion) > 0))
  )
    throw new Error('Package cần runtime khác bản Unity trong ứng dụng.');
  if (
    !text(manifest.materialLibraryVersion) ||
    (pin.materialLibraryVersion !== null &&
      manifest.materialLibraryVersion !== pin.materialLibraryVersion) ||
    (pin.revisionId !== null && manifest.revisionId !== pin.revisionId) ||
    (manifest.buildingId != null && manifest.buildingId !== pin.buildingId)
  )
    throw new Error(
      'Manifest không khớp provenance (revision, building, thư viện vật liệu) đã pin.',
    );
  if (
    !text(manifest.unityVersion) ||
    (manifest.requiredCapabilities !== undefined &&
      (!Array.isArray(manifest.requiredCapabilities) ||
        manifest.requiredCapabilities.some((capability) => !text(capability)))) ||
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
      !isSafePackagePath(file.path) ||
      !isSha256(file.sha256) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 1 ||
      paths.has(file.path)
    )
      throw new Error('Manifest chứa file không hợp lệ hoặc trùng đường dẫn.');
    paths.add(file.path);
  }
  const listed = (path: string | null | undefined) => path == null || paths.has(path);
  if (
    !listed(manifest.metadata) ||
    !listed(manifest.scenario) ||
    manifest.floors.some(
      (floor) =>
        !floor ||
        !paths.has(floor.bundle) ||
        (floor.lightingBundle && !paths.has(floor.lightingBundle)),
    )
  )
    throw new Error('Manifest tham chiếu file chưa được pin SHA-256.');
  return manifest;
}
