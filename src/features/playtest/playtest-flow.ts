/**
 * Pure rules of the organization playtest on Mobile (BE docs/playtest-manual-test.md sections 5–6): which step the screen
 * offers, which mode Unity gets, and how start/reissue recover from a lost response without using a second Trial unit.
 * No React Native imports: unit-tested with `node --test`; the API module injects the HTTP calls and the key storage.
 */
import { ApiError } from '../../api/types/common.ts';
import { APP_RUNTIME_VERSION, BRIDGE_PROTOCOL_VERSION } from '../training/runtime-version.ts';
import { TRAINING_MODES, type TrainingMode } from '../training/session-contract.ts';

export type PlaytestState = 'Created' | 'Launching' | 'Running' | 'Completed' | 'Cancelled';

export type PlaytestStatus = {
  id: string;
  buildingId: string;
  revisionId: string;
  scenarioVersionId: string;
  status: PlaytestState;
  runtimeVersion: string | null;
  package: { packageHash: string; manifestHash: string; buildTarget: string };
  grant: { generation: number; issuedAt?: string; expiresAt: string } | null;
  launchedAt?: string | null;
  acknowledgedSequence: number;
  boundToMobile: boolean;
  launchSession: boolean;
  recovery: { canStart: boolean; canReissueGrant: boolean; canSync: boolean; canCancel: boolean };
  completion: { lastEventSequence: number; summary: unknown } | null;
};

/** POST /start and POST /launch-grants (BE PlaytestLaunch). */
export type PlaytestLaunch = {
  playtestId: string;
  packageHash: string;
  manifestHash: string;
  runtimeVersion: string;
  protocolVersion?: string;
  issuedAt?: string;
  expiresAt: string;
  generation: number;
  launchGrant: string;
};

export type PlaytestOperation = 'start' | 'reissue' | 'cancel';

export const FINAL_STATES: readonly PlaytestState[] = ['Completed', 'Cancelled'];

/** Unity's modes when the scenario has no modePolicy (runtime protocol 1 supports all three). */
export const RUNTIME_MODES: readonly TrainingMode[] = TRAINING_MODES;

/**
 * Modes from the hash-verified scenario.json: `modePolicy.allowedModes` in runtime order, or every runtime mode when the
 * scenario has no policy. Guided is preferred (an author checking the drill), otherwise the first allowed mode.
 */
export function selectPlaytestModes(scenario: unknown): {
  modes: TrainingMode[];
  preferred: TrainingMode | null;
  fromPolicy: boolean;
} {
  const policy = (scenario as { modePolicy?: { allowedModes?: unknown } } | null)?.modePolicy;
  const listed = Array.isArray(policy?.allowedModes) ? (policy.allowedModes as unknown[]) : null;
  const modes = listed ? RUNTIME_MODES.filter((mode) => listed.includes(mode)) : [...RUNTIME_MODES];
  const preferred = modes.includes('Guided') ? 'Guided' : (modes[0] ?? null);
  return { modes, preferred, fromPolicy: listed !== null };
}

/** What the playtest screen offers. Only `start` calls /start; `prepare` only downloads (never uses Trial). */
export type PlaytestStep =
  | { name: 'not-launch-session' }
  | { name: 'prepare' }
  | { name: 'start' }
  | { name: 'retry-launch' }
  | { name: 'wait-launch' }
  | { name: 'back-to-unity' }
  | { name: 'running-elsewhere' }
  | { name: 'final'; state: 'Completed' | 'Cancelled' };

/**
 * `packageReady`: the pinned package is downloaded and SHA-256 verified on this device. `unityAlive`: Unity runs this
 * playtest in this process (its task can be brought back). Gameplay is never restarted automatically.
 */
export function playtestStep(
  status: PlaytestStatus,
  local: { packageReady: boolean; unityAlive: boolean },
): PlaytestStep {
  if (status.status === 'Completed' || status.status === 'Cancelled')
    return { name: 'final', state: status.status };
  if (!status.launchSession) return { name: 'not-launch-session' };
  if (status.status === 'Created') {
    if (!local.packageReady) return { name: 'prepare' };
    return status.recovery.canStart ? { name: 'start' } : { name: 'prepare' };
  }
  if (status.status === 'Launching') {
    if (local.unityAlive) return { name: 'back-to-unity' };
    if (!local.packageReady) return { name: 'prepare' };
    return status.recovery.canReissueGrant ? { name: 'retry-launch' } : { name: 'wait-launch' };
  }
  return local.unityAlive ? { name: 'back-to-unity' } : { name: 'running-elsewhere' };
}

/** A grant Mobile may hand to Unity: this playtest, the verified manifest, this app's runtime, not expired. */
export function assertPlaytestGrant(
  grant: PlaytestLaunch | null | undefined,
  status: PlaytestStatus,
  now = Date.now(),
): PlaytestLaunch {
  if (!grant?.launchGrant || grant.playtestId !== status.id)
    throw new Error('BE trả grant playtest không thuộc playtest này.');
  if (grant.manifestHash !== status.package.manifestHash)
    throw new Error('Grant playtest không khớp package đã tải và kiểm tra SHA-256.');
  if (grant.runtimeVersion !== APP_RUNTIME_VERSION)
    throw new Error(
      `Grant cấp cho runtime ${grant.runtimeVersion}, ứng dụng có runtime ${APP_RUNTIME_VERSION}.`,
    );
  if (grant.protocolVersion != null && grant.protocolVersion !== BRIDGE_PROTOCOL_VERSION)
    throw new Error(`Grant cấp cho protocol ${grant.protocolVersion}.`);
  if (!Number.isSafeInteger(grant.generation) || grant.generation < 1)
    throw new Error('Grant playtest thiếu thế hệ (generation).');
  if (!(Date.parse(grant.expiresAt) > now))
    throw new GrantExpiredError('Grant mở Unity đã hết hạn trước khi mở màn chơi.');
  return grant;
}

export class GrantExpiredError extends Error {
  readonly code = 'PLAYTEST_GRANT_EXPIRED';
}

export class PlaytestBusyError extends Error {
  constructor() {
    super('Đang xử lý yêu cầu trước cho playtest này.');
  }
}

export const problemCode = (issue: unknown): string | null =>
  issue instanceof ApiError && typeof issue.payload?.code === 'string' ? issue.payload.code : null;

/** A response that never arrived (network, timeout, 5xx): the request may have been applied on BE. */
export function responseMayBeLost(issue: unknown): boolean {
  if (issue instanceof ApiError) return issue.status >= 500 && issue.status !== 503;
  return (
    issue instanceof Error &&
    /network|fetch|timeout|timed out|internet|offline|connection|aborted/i.test(issue.message)
  );
}

/** Persisted idempotency keys (one per account + playtest + operation); storage is injected. */
export type KeyStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export function createPlaytestKeys(storage: KeyStorage, newKey: () => string) {
  const name = (accountId: string, playtestId: string, operation: PlaytestOperation) =>
    `fire3d.playtest.key.v1.${accountId}.${playtestId}.${operation}`;
  return {
    async get(accountId: string, playtestId: string, operation: PlaytestOperation) {
      const stored = await storage.getItem(name(accountId, playtestId, operation));
      if (stored) return stored;
      const key = newKey();
      await storage.setItem(name(accountId, playtestId, operation), key);
      return key;
    },
    /** Only for reissue: the replayed generation expired or was superseded, so a new grant needs a new key. */
    async rotate(accountId: string, playtestId: string, operation: PlaytestOperation) {
      const key = newKey();
      await storage.setItem(name(accountId, playtestId, operation), key);
      return key;
    },
    async clear(accountId: string, playtestId: string) {
      for (const operation of ['start', 'reissue', 'cancel'] as const)
        await storage.removeItem(name(accountId, playtestId, operation));
    },
  };
}
export type PlaytestKeys = ReturnType<typeof createPlaytestKeys>;

export type GrantApi = {
  getStatus(id: string): Promise<PlaytestStatus>;
  start(id: string, key: string): Promise<PlaytestLaunch>;
  reissue(id: string, key: string): Promise<PlaytestLaunch>;
};

const inFlight = new Map<string, Promise<unknown>>();

/** One request per account + playtest at a time: a double tap joins nothing and is refused. */
export async function singleFlight<T>(scope: string, run: () => Promise<T>): Promise<T> {
  if (inFlight.has(scope)) throw new PlaytestBusyError();
  const promise = run();
  inFlight.set(scope, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(scope);
  }
}

/** Runs the call; a possibly lost response reads the status first and replays the same key once. Never throws. */
async function withReplay<T>(
  call: () => Promise<T>,
  read: () => Promise<PlaytestStatus>,
): Promise<{ value: T } | { issue: unknown }> {
  try {
    return { value: await call() };
  } catch (issue) {
    if (!responseMayBeLost(issue)) return { issue };
    try {
      await read();
    } catch {
      return { issue };
    }
    try {
      return { value: await call() };
    } catch (replayIssue) {
      return { issue: replayIssue };
    }
  }
}

/**
 * Obtains a launch grant for a downloaded playtest. Created → POST /start with the persisted start key (the only call
 * that can use a Trial unit; the key never changes, so a retry or a lost response can never start twice). A lost response
 * reads the status and replays the same key. Launching → POST /launch-grants with the persisted reissue key, rotated only
 * when that grant expired or was superseded.
 */
export async function acquirePlaytestGrant(
  api: GrantApi,
  keys: PlaytestKeys,
  accountId: string,
  status: PlaytestStatus,
  now: () => number = Date.now,
): Promise<PlaytestLaunch> {
  return singleFlight(`${accountId}:${status.id}`, async () => {
    let current = status;
    if (current.status === 'Created') {
      if (!current.recovery.canStart)
        throw new Error('BE chưa cho phép bắt đầu playtest từ phiên này.');
      const key = await keys.get(accountId, current.id, 'start');
      const outcome = await withReplay(
        () => api.start(current.id, key),
        () => api.getStatus(current.id),
      );
      if ('value' in outcome) {
        try {
          return assertPlaytestGrant(outcome.value, current, now());
        } catch (issue) {
          if (!(issue instanceof GrantExpiredError)) throw issue;
        }
      } else if (problemCode(outcome.issue) !== 'PLAYTEST_GRANT_EXPIRED') throw outcome.issue;
      // Started, but the first grant expired before launch: fall through to a reissue (no Trial).
      current = await api.getStatus(current.id);
    }
    if (current.status !== 'Launching' || !current.recovery.canReissueGrant)
      throw new Error(
        current.status === 'Running'
          ? 'Lượt chạy thử đã được mở trong mô phỏng nên không mở lại được.'
          : 'Máy chủ không cho mở lại lượt chạy thử này. Tạo lượt mới trên web.',
      );
    let key = await keys.get(accountId, current.id, 'reissue');
    for (let attempt = 0; attempt < 2; attempt++) {
      const outcome = await withReplay(
        () => api.reissue(current.id, key),
        () => api.getStatus(current.id),
      );
      if ('value' in outcome) {
        try {
          return assertPlaytestGrant(outcome.value, current, now());
        } catch (issue) {
          if (!(issue instanceof GrantExpiredError)) throw issue;
        }
      } else if (problemCode(outcome.issue) !== 'PLAYTEST_GRANT_EXPIRED') throw outcome.issue;
      key = await keys.rotate(accountId, current.id, 'reissue');
    }
    throw new Error('Quyền mở mô phỏng liên tục báo hết hạn. Kiểm tra giờ trên điện thoại (bật giờ tự động) rồi thử lại.');
  });
}

/**
 * Handoff screen: a valid code is redeemed only by a signed-in OrganizationUser (BE then binds the playtest to this login
 * session; another user's code is 404 PLAYTEST_HANDOFF_INVALID). A signed-out user keeps the code across the login.
 */
export function handoffView(
  validCode: boolean,
  account: { role: string } | null | undefined,
): 'invalid' | 'login' | 'wrong-role' | 'redeem' {
  if (!validCode) return 'invalid';
  if (!account) return 'login';
  return account.role === 'OrganizationUser' ? 'redeem' : 'wrong-role';
}

/** Messages for BE problem codes and app-side failures of the playtest flow. */
export function describePlaytestProblem(issue: unknown, fallback: string): string {
  const code =
    problemCode(issue) ?? (issue as { code?: unknown } | null)?.code?.toString?.() ?? null;
  switch (code) {
    case 'RUNTIME_INCOMPATIBLE':
      return `Phiên bản ứng dụng này (mô phỏng ${APP_RUNTIME_VERSION}) chưa chạy được kịch bản này. Hãy cập nhật FET3D hoặc báo quản trị viên.`;
    case 'PLAYTEST_ENTITLEMENT_REQUIRED':
      return 'Tòa nhà chưa có gói dịch vụ hoặc đã hết lượt chạy thử miễn phí. Gia hạn hoặc mua gói trên web rồi thử lại.';
    case 'PLAYTEST_SESSION_MISMATCH':
      return 'Lượt chạy thử đang gắn với phiên đăng nhập khác (trên web hoặc máy khác). Tạo mã mới trên web cho máy này.';
    case 'PLAYTEST_GRANT_EXPIRED':
      return 'Quyền mở mô phỏng đã hết hạn. Bấm "Thử mở lại" để nhận quyền mới (không dùng thêm lượt chạy thử).';
    case 'PLAYTEST_GRANT_STALE':
      return 'Lượt chạy thử này vừa được mở lại ở lần khác; lần mở cũ đã dừng.';
    case 'PLAYTEST_ALREADY_LAUNCHED':
      return 'Lượt chạy thử đã được mở trong mô phỏng, không mở lại được. Muốn chơi lại, hãy tạo lượt mới trên web.';
    case 'PLAYTEST_ALREADY_STARTED':
      return 'Lượt chạy thử đã được bắt đầu từ một phiên đăng nhập khác.';
    case 'PLAYTEST_TERMINAL':
      return 'Lượt chạy thử đã kết thúc. Muốn chơi lại, hãy tạo lượt mới trên web.';
    case 'PLAYTEST_HANDOFF_INVALID':
      return 'Mã chạy thử không thuộc tài khoản này hoặc không tồn tại. Đăng nhập đúng tài khoản đã tạo lượt chạy thử trên web.';
    case 'PLAYTEST_HANDOFF_USED':
      return 'Mã chạy thử đã được dùng ở phiên đăng nhập khác. Tạo mã mới trên web.';
    case 'PLAYTEST_HANDOFF_EXPIRED':
    case 'PLAYTEST_HANDOFF_REVOKED':
      return 'Mã chạy thử đã hết hạn hoặc đã được thay. Tạo mã mới trên web.';
    case 'PLAYTEST_HANDOFF_ISSUER_INVALID':
      return 'Tài khoản tạo mã đã đăng xuất trên web. Đăng nhập lại web và tạo mã mới.';
    case 'PLAYTEST_LAUNCH_UNAVAILABLE':
      return 'Hệ thống chưa bật chạy thử. Liên hệ quản trị FET3D.';
    case 'PLAYTEST_PACKAGE_REQUIRED':
      return 'Phiên bản kịch bản này chưa có gói mô phỏng đã kiểm tra.';
    case 'IDEMPOTENCY_KEY_CONFLICT':
      return 'Yêu cầu bị trùng với một yêu cầu trước. Kéo xuống để tải lại rồi thử lại.';
    case 'RUNTIME_MISMATCH':
    case 'ERR_UNITY_RUNTIME_MISMATCH':
      return `Bộ mô phỏng trong ứng dụng không đúng phiên bản (cần ${APP_RUNTIME_VERSION}, giao thức ${BRIDGE_PROTOCOL_VERSION}). Hãy cập nhật FET3D.`;
    case 'PACKAGE_SESSION_NOT_ACTIVE':
      return 'Gói mô phỏng không còn mở cho phiên này: lượt chạy thử đã bị hủy, đã kết thúc hoặc đã chuyển sang phiên khác. Trạng thái bên dưới đã được tải lại.';
    case 'PACKAGE_HASH_MISMATCH':
      return 'Gói đã tải trên máy bị lỗi hoặc không đầy đủ. Hãy tải lại gói.';
    default:
      break;
  }
  if (issue instanceof PlaytestBusyError) return issue.message;
  if (issue instanceof ApiError && issue.status === 401)
    return 'Phiên đăng nhập đã hết. Đăng nhập lại bằng tài khoản tổ chức.';
  if (issue instanceof ApiError && issue.status === 404)
    return 'Không tìm thấy lượt chạy thử cho tài khoản này. Kiểm tra lại tài khoản đã quét mã.';
  if (issue instanceof Error && /SHA-256/.test(issue.message))
    return 'Gói đã tải trên máy bị lỗi hoặc không đầy đủ. Hãy tải lại gói.';
  return issue instanceof Error && issue.message ? issue.message : fallback;
}
