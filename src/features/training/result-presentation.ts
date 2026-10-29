import type { TrainingResult } from '@/api/training-history';

/**
 * Learner-facing wording of results, shared by the screen right after play, the history list and the history detail.
 * BE decides the outcome, score and threshold; this only translates them. Codes are never shown: unknown outcomes,
 * reasons and metrics get neutral Vietnamese text instead of the raw value or a guessed cause.
 */

export type ResultTone = 'success' | 'danger' | 'warning' | 'neutral';
export type OutcomeKind =
  'Passed' | 'NotPassed' | 'Incomplete' | 'NotAssessed' | 'Pending' | 'Unknown';
export type OutcomeView = { kind: OutcomeKind; label: string; tone: ResultTone };

export type CriterionRow = {
  id: string;
  label: string;
  state: 'passed' | 'failed' | 'unavailable';
  note: string | null;
};

export type ResultAction =
  | { intent: 'retry'; label: string }
  | { intent: 'assessment'; label: string }
  | { intent: 'scan'; label: string };

export type ResultViewModel = {
  outcome: OutcomeView;
  headline: string;
  scoreText: string | null;
  thresholdText: string | null;
  criteria: CriterionRow[];
  primary: ResultAction;
  disclaimer: string;
};

export type WaitingView = { kind: 'saved-offline' | 'processing'; title: string; body: string };

const OUTCOMES: Record<Exclude<OutcomeKind, 'Unknown'>, Omit<OutcomeView, 'kind'>> = {
  Passed: { label: 'Đạt', tone: 'success' },
  NotPassed: { label: 'Chưa đạt', tone: 'danger' },
  Incomplete: { label: 'Chưa hoàn thành', tone: 'warning' },
  NotAssessed: { label: 'Không chấm điểm', tone: 'neutral' },
  Pending: { label: 'Chờ đồng bộ', tone: 'warning' },
};

/** Metrics of the BE runtime catalog (EditorContract core + event-count metrics). */
export const METRIC_LABELS: Record<string, string> = {
  reached_exit: 'Đến được lối thoát',
  completion_time_seconds: 'Thời gian thoát hiểm',
  wrong_exits: 'Số lần đi nhầm lối',
  hazard_exposure: 'Mức tiếp xúc nguy hiểm',
  distance_meters: 'Quãng đường di chuyển',
  alarm_raised: 'Kéo chuông báo cháy',
  extinguisher_used: 'Dùng bình chữa cháy',
  extinguish_attempt_large_fire: 'Cố dập đám cháy lớn',
  item_wetted: 'Làm ướt khăn che mặt',
  nose_covered_in_smoke: 'Che mũi miệng khi có khói',
  checked_door_heat: 'Kiểm tra nhiệt cửa trước khi mở',
  closed_door: 'Đóng cửa sau khi đi qua',
  used_elevator: 'Dùng thang máy',
  went_back_for_belongings: 'Quay lại lấy đồ',
  npc_guided: 'Hướng dẫn người khác thoát',
};

const UNKNOWN_METRIC = 'Tiêu chí của bài';
const MISSING_DATA = 'Chưa đủ dữ liệu đánh giá';

const REASONS: Record<string, string> = {
  ALL_REQUIREMENTS_MET: 'Bạn đạt mọi yêu cầu của bài đánh giá.',
  BELOW_PASS_THRESHOLD: 'Điểm chưa đạt mức yêu cầu.',
  MANDATORY_CRITERION_FAILED: 'Còn một tiêu chí bắt buộc chưa đạt.',
  ENDED_BEFORE_COMPLETION: 'Phiên kết thúc trước khi hoàn thành tình huống.',
  MODE_NOT_ASSESSED: 'Học và Diễn tập không chấm Đạt/Chưa đạt. Chọn Đánh giá để được chấm.',
  RUBRIC_NOT_SCORABLE: 'Bài này chưa có tiêu chí chấm nên không tính điểm.',
};
const NEUTRAL_REASON = 'Kết quả do FET3D chấm theo tiêu chí của bài.';

const percent = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : null;

export function presentOutcome(status: string | null | undefined): OutcomeView {
  if (status === null || status === undefined) return { kind: 'Pending', ...OUTCOMES.Pending };
  if (Object.hasOwn(OUTCOMES, status) && status !== 'Pending') {
    const kind = status as Exclude<OutcomeKind, 'Unknown' | 'Pending'>;
    return { kind, ...OUTCOMES[kind] };
  }
  return { kind: 'Unknown', label: 'Kết quả chưa xác định', tone: 'neutral' };
}

/** Learner label first, then the known metric name; missing data is its own state, never shown as a mistake. */
export function presentCriterion(
  criterion: NonNullable<TrainingResult['criteria']>[number],
): CriterionRow {
  const label =
    criterion.label?.trim() ||
    (Object.hasOwn(METRIC_LABELS, criterion.metric)
      ? METRIC_LABELS[criterion.metric]
      : UNKNOWN_METRIC);
  if (criterion.reason === 'METRIC_UNAVAILABLE')
    return { id: criterion.id, label, state: 'unavailable', note: MISSING_DATA };
  return { id: criterion.id, label, state: criterion.passed ? 'passed' : 'failed', note: null };
}

function headlineOf(result: TrainingResult): string {
  const score = percent(result.scorePercent);
  const threshold = percent(result.passThresholdPercent);
  if (result.reason === 'BELOW_PASS_THRESHOLD' && score && threshold)
    return `Điểm ${score} thấp hơn mức yêu cầu ${threshold}.`;
  return Object.hasOwn(REASONS, result.reason) ? REASONS[result.reason] : NEUTRAL_REASON;
}

/**
 * `canReplay`: the training can be opened again (QR known). NotAssessed then suggests Assessment, other outcomes the
 * same training; without it the learner is sent to scan the Building QR.
 */
export function presentResult(
  result: TrainingResult,
  options: { canReplay: boolean },
): ResultViewModel {
  const outcome = presentOutcome(result.outcome);
  const threshold = percent(result.passThresholdPercent);
  const primary: ResultAction = !options.canReplay
    ? { intent: 'scan', label: 'Quét QR để chơi lại' }
    : outcome.kind === 'NotAssessed'
      ? { intent: 'assessment', label: 'Thử Đánh giá' }
      : { intent: 'retry', label: 'Chơi lại' };
  return {
    outcome,
    headline: headlineOf(result),
    scoreText: percent(result.scorePercent),
    thresholdText: threshold ? `Mức yêu cầu ${threshold}` : null,
    criteria: (result.criteria ?? []).map(presentCriterion),
    primary,
    disclaimer:
      'Kết quả do FET3D chấm cho mục đích học tập, không phải chứng nhận an toàn PCCC. Chơi lại không giới hạn.',
  };
}

/**
 * Waiting for a result: data still on the phone (offline, unsent events or completion) or already with FET3D and
 * being scored. Never shows counts, ids or progress the app cannot know.
 */
export function presentWaiting(state: {
  pendingEvents: number;
  completionPending: boolean;
  offline: boolean;
}): WaitingView {
  if (state.offline || state.pendingEvents > 0 || state.completionPending)
    return {
      kind: 'saved-offline',
      title: 'Kết quả đã lưu trên máy',
      body: state.offline
        ? 'Kết quả sẽ được gửi khi có mạng. Bạn có thể đóng màn hình này.'
        : 'Đang gửi kết quả. Nếu mạng chập chờn, kết quả vẫn được giữ trên máy và gửi lại sau.',
    };
  return {
    kind: 'processing',
    title: 'Đang xử lý kết quả',
    body: 'FET3D đang chấm phiên của bạn. Bấm Đồng bộ lại nếu chờ lâu.',
  };
}
