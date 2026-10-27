/**
 * Pure adapters between the Fire3D API learner-session contract (BE `LearnerSessionContracts.cs`,
 * `RuntimePackageDownload`) and what Mobile hands to the package cache and Unity. No React Native imports: unit-tested
 * with `node --test`.
 */
import {
  APP_RUNTIME_VERSION,
  PACKAGE_SCHEMA,
  isSafePackagePath,
  isSha256,
  type ContentManifest,
  type PackagePin,
} from './package-contract.ts';

export type TrainingMode = 'Learn' | 'Guided' | 'Assessment';
export const TRAINING_MODES: readonly TrainingMode[] = ['Learn', 'Guided', 'Assessment'];
export const MODE_LABELS: Record<TrainingMode, { title: string; description: string }> = {
  Learn: {
    title: 'Học',
    description: 'Làm quen tòa nhà và thao tác có hướng dẫn; không chấm Đạt/Chưa đạt.',
  },
  Guided: {
    title: 'Diễn tập có hướng dẫn',
    description: 'Diễn tập tình huống với gợi ý từng bước; không chấm Đạt/Chưa đạt.',
  },
  Assessment: {
    title: 'Đánh giá',
    description: 'Tự xử lý tình huống, không có trợ lý AI; được chấm theo tiêu chí đã duyệt.',
  },
};

export function allowedTrainingModes(values: readonly string[] | null | undefined): TrainingMode[] {
  const set = new Set(values ?? []);
  return TRAINING_MODES.filter((mode) => set.has(mode));
}

/** TrainingSessionView.package: the pin of a preparation/session (object keys are removed by BE). */
export type SessionPackage = {
  packageId?: string;
  artifactId?: string;
  manifestArtifactId?: string;
  validationRunId?: string;
  packageHash: string | null;
  manifestHash: string | null;
  buildTarget?: string | null;
  minRuntimeVersion?: string | null;
  protocolVersion?: string | null;
  manifestSchemaVersion?: string | null;
  requiredCapabilities?: string[] | null;
  contentReviewId?: string;
};

/** Prepared → Launching → Running → AwaitingSync → Completed; Expired preparations must be prepared again. */
export type TrainingSession = {
  id: string;
  status: string;
  trainingId: string;
  releaseId: string;
  scenarioVersionId: string;
  buildingId: string;
  mode: string;
  runtimeVersion: string;
  scenarioHash: string;
  rubricHash: string | null;
  package: SessionPackage;
  preparedAt?: string | null;
  expiresAt?: string | null;
  startedAt?: string | null;
  launchedAt?: string | null;
  endedAt?: string | null;
  grant?: { generation: number; issuedAt: string; expiresAt: string } | null;
  launchSession?: boolean | null;
  continuationExpiresAt?: string | null;
  acknowledgedSequence?: number | null;
  completion?: { lastEventSequence: number; endReason: string; requestedAt: string } | null;
  hasResult: boolean;
};

export type StartTrainingResponse = {
  session: TrainingSession;
  launch: {
    sessionId: string;
    generation: number;
    issuedAt?: string;
    expiresAt: string;
    launchGrant: string;
  };
  continuation: { sessionId?: string; token: string; expiresAt: string };
};

/** GET /api/training/sessions/{id}/package and GET /api/playtests/{id}/package (signed URLs, 10 minutes). */
export type RuntimePackageDownload = {
  schemaVersion: string;
  manifest: { url: string; sha256: string; sizeBytes: number };
  files: { path: string; url: string; sha256: string; sizeBytes: number }[];
  floors: unknown;
  runtimeVersion: string | null;
  buildTarget: string | null;
  expiresAt: string;
};

export type PlannedFile = { url: string; sha256: string; sizeBytes: number };
export type PackagePlan = {
  pin: PackagePin;
  manifest: PlannedFile;
  files: Record<string, PlannedFile>;
  fileCount: number;
  totalBytes: number;
  /** Epoch milliseconds when the signed URLs stop working. */
  expiresAt: number;
};

const PREPARED_OR_ACTIVE = ['Prepared', 'Launching', 'Running'];

function httpsUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' && !!parsed.hostname && !parsed.username && !parsed.password
    );
  } catch {
    return false;
  }
}

/** The pin Mobile can derive from a prepared/started session; anything missing stops before download. */
export function pinFromSession(session: TrainingSession): PackagePin {
  if (!session?.id || !PREPARED_OR_ACTIVE.includes(session.status))
    throw new Error(
      'Phiên chưa ở trạng thái Prepared/Launching/Running nên không tải được package.',
    );
  if (session.runtimeVersion !== APP_RUNTIME_VERSION)
    throw new Error(
      `Phiên được chuẩn bị cho runtime ${session.runtimeVersion}, ứng dụng có ${APP_RUNTIME_VERSION}.`,
    );
  const pkg = session.package;
  if (!pkg || !isSha256(pkg.manifestHash) || !isSha256(pkg.packageHash))
    throw new Error('BE chưa pin manifest/package SHA-256 cho phiên này.');
  if (pkg.buildTarget != null && pkg.buildTarget !== 'Android')
    throw new Error(`Package được build cho ${pkg.buildTarget}, không phải Android.`);
  if (!session.releaseId || !session.buildingId)
    throw new Error('Phiên thiếu release hoặc Building.');
  return {
    releaseId: session.releaseId,
    manifestHash: pkg.manifestHash,
    buildingId: session.buildingId,
    revisionId: null,
    runtimeVersion: APP_RUNTIME_VERSION,
    materialLibraryVersion: null,
  };
}

/** Turns the signed-URL response into a download plan after checking it is the package the session pinned. */
export function planPackageDownload(
  pin: PackagePin,
  download: RuntimePackageDownload,
  now = Date.now(),
): PackagePlan {
  if (!download || download.schemaVersion !== PACKAGE_SCHEMA)
    throw new Error('BE trả package không phải fet3d.package/1.');
  if (download.manifest?.sha256 !== pin.manifestHash)
    throw new Error('Manifest BE cấp không khớp manifest đã pin khi chuẩn bị phiên.');
  if (download.buildTarget != null && download.buildTarget !== 'Android')
    throw new Error(`Package được build cho ${download.buildTarget}, không phải Android.`);
  if (
    download.runtimeVersion != null &&
    download.runtimeVersion.split('.')[0] !== APP_RUNTIME_VERSION.split('.')[0]
  )
    throw new Error(
      `Package cần runtime ${download.runtimeVersion}, ứng dụng có ${APP_RUNTIME_VERSION}.`,
    );
  if (!httpsUrl(download.manifest.url) || !Number.isSafeInteger(download.manifest.sizeBytes))
    throw new Error('URL tải manifest phải là HTTPS và có kích thước hợp lệ.');
  const expiresAt = Date.parse(download.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now)
    throw new Error('URL tải package đã hết hạn; hãy thử lại để lấy URL mới.');
  if (!Array.isArray(download.files) || download.files.length === 0)
    throw new Error('BE chưa cấp danh sách file package.');
  const files: Record<string, PlannedFile> = Object.create(null) as Record<string, PlannedFile>;
  let totalBytes = download.manifest.sizeBytes;
  for (const file of download.files) {
    if (
      !file ||
      !isSafePackagePath(file.path) ||
      Object.hasOwn(files, file.path) ||
      !isSha256(file.sha256) ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 1 ||
      !httpsUrl(file.url)
    )
      throw new Error('BE trả file package không hợp lệ, trùng đường dẫn hoặc không dùng HTTPS.');
    files[file.path] = { url: file.url, sha256: file.sha256, sizeBytes: file.sizeBytes };
    totalBytes += file.sizeBytes;
  }
  return {
    pin,
    manifest: { ...download.manifest },
    files,
    fileCount: download.files.length,
    totalBytes,
    expiresAt,
  };
}

/** The verified manifest and the signed-URL list must describe exactly the same files. */
export function crossCheckManifest(manifest: ContentManifest, plan: PackagePlan): void {
  if (manifest.files.length !== plan.fileCount)
    throw new Error('Manifest và danh sách tải của BE có số file khác nhau.');
  for (const entry of manifest.files) {
    const planned = Object.hasOwn(plan.files, entry.path) ? plan.files[entry.path] : undefined;
    if (!planned) throw new Error(`BE chưa cấp URL tải cho ${entry.path}.`);
    if (planned.sha256 !== entry.sha256 || planned.sizeBytes !== entry.size)
      throw new Error(`SHA-256 hoặc kích thước của ${entry.path} khác giữa manifest và BE.`);
  }
}

/** Online start must return the very session that was prepared, downloaded and verified. */
export function assertStartMatchesPrepare(
  prepared: TrainingSession,
  started: StartTrainingResponse,
  now = Date.now(),
): void {
  const session = started?.session;
  if (
    !session ||
    session.id !== prepared.id ||
    started.launch?.sessionId !== prepared.id ||
    session.releaseId !== prepared.releaseId ||
    session.buildingId !== prepared.buildingId ||
    session.scenarioVersionId !== prepared.scenarioVersionId ||
    session.mode !== prepared.mode ||
    session.runtimeVersion !== prepared.runtimeVersion ||
    session.package?.manifestHash !== prepared.package.manifestHash ||
    session.package?.packageHash !== prepared.package.packageHash
  )
    throw new Error(
      'Phiên BE vừa start không khớp package/release đã chuẩn bị và kiểm tra. Đã dừng.',
    );
  if (!started.launch.launchGrant || !(Date.parse(started.launch.expiresAt) > now))
    throw new Error('Grant mở Unity đã hết hạn hoặc không hợp lệ.');
  if (!started.continuation?.token) throw new Error('BE chưa cấp continuation token cho phiên.');
}

export function urlsExpireSoon(plan: PackagePlan, now = Date.now(), marginMs = 60_000): boolean {
  return plan.expiresAt - now <= marginMs;
}

/** 5 s, 10 s, 20 s … capped at 5 minutes. */
export function retryDelayMs(attempt: number): number {
  return Math.min(300_000, 5_000 * 2 ** Math.max(0, Math.min(attempt, 10)));
}

/** Signed S3 URLs answer 403 (or 400/401 on some gateways) once they expire. */
export function looksLikeExpiredUrl(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /\b(400|401|403)\b|expired|forbidden|access ?denied|signature/i.test(message);
}

/** "850 KB", "12,3 MB", "1,05 GB" (Vietnamese decimal comma). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits).replace('.', ',')} ${units[unit]}`;
}

/** Stable learner-facing messages for BE problem codes on prepare/package/start. */
export function describeTrainingProblem(code: unknown, status: number, fallback: string): string {
  switch (code) {
    case 'BUILDING_ACCESS_REQUIRED':
      return 'Bạn cần mã tham gia Building trước khi tập huấn.';
    case 'BUILDING_ENTITLEMENT_REQUIRED':
      return 'Tòa nhà chưa có gói dịch vụ đang hoạt động; hiện không thể bắt đầu phiên mới.';
    case 'LEARNER_LIMIT_REACHED':
      return 'Tòa nhà đã hết suất học viên trong kỳ dịch vụ này.';
    case 'TRAINING_UNAVAILABLE':
      return 'Bài tập không còn mở để tập huấn.';
    case 'CONTENT_APPROVAL_REQUIRED':
      return 'Kịch bản chưa được duyệt hoặc đã bị gỡ duyệt.';
    case 'RUNTIME_INCOMPATIBLE':
      return 'Bài tập cần phiên bản ứng dụng mới hơn. Hãy cập nhật FET3D.';
    case 'MODE_NOT_ALLOWED':
      return 'Chế độ này không được phép cho bài tập.';
    case 'RUBRIC_NOT_SUPPORTED':
      return 'Bài tập chưa có tiêu chí chấm cho chế độ Đánh giá.';
    case 'PACKAGE_SESSION_NOT_ACTIVE':
      return 'Phiên chuẩn bị đã hết hạn hoặc không còn thuộc lần đăng nhập này. Hãy chuẩn bị lại.';
    case 'PACKAGE_FORMAT_UNSUPPORTED':
      return 'Gói bài tập chưa đúng định dạng ứng dụng hỗ trợ. Hãy báo tổ chức của bạn.';
    default:
      if (status === 401) return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
      return fallback;
  }
}
