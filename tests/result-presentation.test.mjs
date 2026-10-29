// Learner-facing result wording: BE outcome/score/threshold are translated, never recomputed, and no technical code
// (outcome, reason or metric) reaches the screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  METRIC_LABELS,
  presentCriterion,
  presentOutcome,
  presentResult,
  presentWaiting,
} from '../src/features/training/result-presentation.ts';

function result(overrides = {}) {
  return {
    sessionId: 'session-1',
    mode: 'Assessment',
    outcome: 'Passed',
    reason: 'ALL_REQUIREMENTS_MET',
    scorePercent: 85,
    passThresholdPercent: 70,
    criteria: [{ id: 'c1', label: null, metric: 'reached_exit', passed: true, reason: null }],
    lastEventSequence: 12,
    createdAt: '2026-10-29T08:00:00Z',
    ...overrides,
  };
}

const CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;
function assertNoCodes(view) {
  const text = JSON.stringify(view);
  assert.doesNotMatch(text, CODE);
  for (const metric of Object.keys(METRIC_LABELS))
    assert.equal(text.includes(metric), false, metric);
  for (const raw of ['Passed', 'NotPassed', 'Incomplete', 'NotAssessed', 'SOMETHING', 'zz_metric'])
    assert.equal(text.includes(`"${raw}"`) && !text.includes(`"kind":"${raw}"`), false, raw);
}

test('the four BE outcomes, a missing result and an unknown value get learner labels', () => {
  assert.deepEqual(presentOutcome('Passed'), { kind: 'Passed', label: 'Đạt', tone: 'success' });
  assert.deepEqual(presentOutcome('NotPassed'), {
    kind: 'NotPassed',
    label: 'Chưa đạt',
    tone: 'danger',
  });
  assert.deepEqual(presentOutcome('Incomplete'), {
    kind: 'Incomplete',
    label: 'Chưa hoàn thành',
    tone: 'warning',
  });
  assert.deepEqual(presentOutcome('NotAssessed'), {
    kind: 'NotAssessed',
    label: 'Không chấm điểm',
    tone: 'neutral',
  });
  assert.equal(presentOutcome(null).label, 'Chờ đồng bộ');
  assert.equal(presentOutcome('Pending').kind, 'Unknown', 'Pending is not a BE outcome');
  assert.deepEqual(presentOutcome('Certified'), {
    kind: 'Unknown',
    label: 'Kết quả chưa xác định',
    tone: 'neutral',
  });
});

test('score and required level come from BE as they are', () => {
  const view = presentResult(result(), { canReplay: true });
  assert.equal(view.scoreText, '85%');
  assert.equal(view.thresholdText, 'Mức yêu cầu 70%');
  assert.equal(view.headline, 'Bạn đạt mọi yêu cầu của bài đánh giá.');
  const none = presentResult(
    result({
      outcome: 'NotAssessed',
      reason: 'MODE_NOT_ASSESSED',
      scorePercent: null,
      passThresholdPercent: null,
    }),
    { canReplay: true },
  );
  assert.equal(none.scoreText, null);
  assert.equal(none.thresholdText, null);
});

test('every known reason has a sentence; below threshold names both numbers; unknown reasons stay neutral', () => {
  const headline = (reason, extra = {}) =>
    presentResult(result({ reason, ...extra }), { canReplay: true }).headline;
  assert.equal(
    headline('BELOW_PASS_THRESHOLD', { outcome: 'NotPassed', scorePercent: 60 }),
    'Điểm 60% thấp hơn mức yêu cầu 70%.',
  );
  assert.equal(
    headline('BELOW_PASS_THRESHOLD', { passThresholdPercent: null }),
    'Điểm chưa đạt mức yêu cầu.',
  );
  assert.equal(headline('MANDATORY_CRITERION_FAILED'), 'Còn một tiêu chí bắt buộc chưa đạt.');
  assert.equal(
    headline('ENDED_BEFORE_COMPLETION'),
    'Phiên kết thúc trước khi hoàn thành tình huống.',
  );
  assert.match(headline('MODE_NOT_ASSESSED'), /Chọn Đánh giá/);
  assert.equal(
    headline('RUBRIC_NOT_SCORABLE'),
    'Bài này chưa có tiêu chí chấm nên không tính điểm.',
  );
  assert.equal(headline('SOMETHING_NEW'), 'Kết quả do FET3D chấm theo tiêu chí của bài.');
});

test('criteria: author label first, known metrics in Vietnamese, unknown metrics neutral', () => {
  const row = (criterion) =>
    presentCriterion({ id: 'c', passed: true, reason: null, label: null, ...criterion });
  assert.equal(
    row({ label: 'Thoát qua cầu thang bộ', metric: 'reached_exit' }).label,
    'Thoát qua cầu thang bộ',
  );
  assert.equal(row({ label: '   ', metric: 'reached_exit' }).label, 'Đến được lối thoát');
  assert.equal(row({ metric: 'completion_time_seconds' }).label, 'Thời gian thoát hiểm');
  assert.equal(row({ metric: 'zz_metric' }).label, 'Tiêu chí của bài');
  assert.equal(row({ metric: 'toString' }).label, 'Tiêu chí của bài');
  assert.deepEqual(row({ metric: 'wrong_exits', passed: false }), {
    id: 'c',
    label: 'Số lần đi nhầm lối',
    state: 'failed',
    note: null,
  });
});

test('missing data is its own state, never shown as a mistake; unknown criterion reasons are not shown', () => {
  const unavailable = presentCriterion({
    id: 'c',
    label: null,
    metric: 'hazard_exposure',
    passed: false,
    reason: 'METRIC_UNAVAILABLE',
  });
  assert.equal(unavailable.state, 'unavailable');
  assert.equal(unavailable.note, 'Chưa đủ dữ liệu đánh giá');
  const odd = presentCriterion({
    id: 'c',
    label: null,
    metric: 'hazard_exposure',
    passed: false,
    reason: 'SENSOR_GLITCH',
  });
  assert.equal(odd.state, 'failed');
  assert.equal(odd.note, null);
});

test('actions follow the state: replay, Assessment after a practice mode, or scan the QR', () => {
  assert.deepEqual(presentResult(result(), { canReplay: true }).primary, {
    intent: 'retry',
    label: 'Chơi lại',
  });
  assert.deepEqual(
    presentResult(result({ outcome: 'NotAssessed', reason: 'MODE_NOT_ASSESSED' }), {
      canReplay: true,
    }).primary,
    { intent: 'assessment', label: 'Thử Đánh giá' },
  );
  assert.deepEqual(presentResult(result(), { canReplay: false }).primary, {
    intent: 'scan',
    label: 'Quét QR để chơi lại',
  });
});

test('waiting screen says where the result is, without counts or ids', () => {
  assert.equal(
    presentWaiting({ pendingEvents: 0, completionPending: false, offline: true }).title,
    'Kết quả đã lưu trên máy',
  );
  assert.match(
    presentWaiting({ pendingEvents: 0, completionPending: false, offline: true }).body,
    /khi có mạng/,
  );
  assert.equal(
    presentWaiting({ pendingEvents: 3, completionPending: false, offline: false }).kind,
    'saved-offline',
  );
  assert.equal(
    presentWaiting({ pendingEvents: 0, completionPending: true, offline: false }).kind,
    'saved-offline',
  );
  const processing = presentWaiting({ pendingEvents: 0, completionPending: false, offline: false });
  assert.equal(processing.title, 'Đang xử lý kết quả');
  for (const view of [
    processing,
    presentWaiting({ pendingEvents: 7, completionPending: true, offline: true }),
  ])
    assert.doesNotMatch(JSON.stringify(view), /\b\d+\b|Unity|sự kiện|session/i);
});

test('no technical code leaks for any outcome, reason or metric, known or not', () => {
  const metrics = [...Object.keys(METRIC_LABELS), 'zz_metric'];
  for (const outcome of ['Passed', 'NotPassed', 'Incomplete', 'NotAssessed', 'SOMETHING'])
    for (const reason of [
      'ALL_REQUIREMENTS_MET',
      'BELOW_PASS_THRESHOLD',
      'MANDATORY_CRITERION_FAILED',
      'ENDED_BEFORE_COMPLETION',
      'MODE_NOT_ASSESSED',
      'RUBRIC_NOT_SCORABLE',
      'SOMETHING_NEW',
    ])
      for (const canReplay of [true, false]) {
        const view = presentResult(
          result({
            outcome,
            reason,
            criteria: metrics.map((metric, index) => ({
              id: `c${index}`,
              label: null,
              metric,
              passed: index % 2 === 0,
              reason: index % 3 === 0 ? 'METRIC_UNAVAILABLE' : index % 5 === 0 ? 'ODD_CODE' : null,
            })),
          }),
          { canReplay },
        );
        const { outcome: shown, ...rest } = view;
        assert.equal(shown.label.includes(outcome) && outcome !== 'Passed', false);
        assertNoCodes({ ...rest, label: shown.label });
      }
  assertNoCodes({ criteria: [] });
});
