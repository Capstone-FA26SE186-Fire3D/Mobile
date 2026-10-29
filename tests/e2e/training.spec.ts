import { expect, test, type Page } from '@playwright/test';

const token = 'b'.repeat(43);
const buildingId = '11111111-1111-4111-8111-111111111111';
const trainingId = '77777777-7777-4777-8777-777777777777';
const sessionId = '44444444-4444-4444-8444-444444444444';
const user = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'trainee@example.test',
  fullName: 'Trainee Flow',
  role: 'Trainee',
  organizationId: null,
};
const hash = (char: string) => char.repeat(64);

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    status: 'Prepared',
    trainingId,
    releaseId: '33333333-3333-4333-8333-333333333333',
    scenarioVersionId: '55555555-5555-4555-8555-555555555555',
    buildingId,
    mode: 'Assessment',
    runtimeVersion: '2.0.2',
    scenarioHash: hash('9'),
    rubricHash: hash('8'),
    package: { packageHash: hash('a'), manifestHash: hash('b'), buildTarget: 'Android' },
    preparedAt: '2026-10-19T08:00:00Z',
    expiresAt: '2099-10-20T08:00:00Z',
    hasResult: false,
    ...overrides,
  };
}

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function login(page: Page) {
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Vào game', exact: true }).click();
}

test('QR → training → mode → prepare; web without Unity explains instead of crashing', async ({
  page,
}) => {
  const prepareCalls: { key: string | null; body: unknown }[] = [];
  const errors: string[] = [];
  page.on('pageerror', (issue) => errors.push(issue.message));
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(json({ accessToken: 'access', refreshToken: 'refresh', user })),
  );
  await page.route(`**/api/qr/${token}`, (route) =>
    route.fulfill(
      json({
        buildingId,
        buildingName: 'Tòa nhà B',
        visibility: 'Public',
        hasAccess: true,
        serviceStatus: 'Active',
        serviceEndsAt: null,
        canStartNewSessions: true,
      }),
    ),
  );
  await page.route(`**/api/qr/${token}/trainings`, (route) =>
    route.fulfill(
      json([
        {
          id: trainingId,
          name: 'Thoát hiểm tầng 3',
          description: 'Sơ tán khi có khói hành lang.',
          allowedModes: ['Learn', 'Assessment'],
        },
      ]),
    ),
  );
  await page.route(
    (url) => url.pathname === '/api/training/sessions',
    async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.fallback();
      prepareCalls.push({
        key: request.headers()['idempotency-key'] ?? null,
        body: request.postDataJSON(),
      });
      await route.fulfill(json(session(), 201));
    },
  );
  await page.route(`**/api/training/sessions/${sessionId}`, (route) =>
    route.fulfill(json(session())),
  );

  await page.goto(`/qr/${token}`);
  await page.getByRole('button', { name: 'Đăng nhập và tiếp tục' }).click();
  await login(page);
  await expect(page.getByText('Tòa nhà B')).toBeVisible();
  await expect(page.getByText('Đánh giá', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mở bài tập Thoát hiểm tầng 3' }).click();

  await expect(page.getByText('CHỌN CÁCH CHƠI')).toBeVisible();
  const prepare = page.getByRole('button', { name: 'Chuẩn bị phiên' });
  await expect(prepare).toBeDisabled();
  await page.getByRole('radio', { name: 'Đánh giá' }).click();
  await prepare.click();

  await expect(page.getByText(/Cần ứng dụng FET3D cho Android có tích hợp Unity/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tải gói tập huấn' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bắt đầu phiên' })).toHaveCount(0);
  expect(prepareCalls).toHaveLength(1);
  expect(prepareCalls[0].body).toEqual({ trainingId, mode: 'Assessment', runtimeVersion: '2.0.2' });
  expect(prepareCalls[0].key).toMatch(/^[0-9a-f-]{36}$/i);

  // Coming back restores the same preparation from the persisted attempt: no second prepare.
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await page.getByRole('button', { name: 'Mở bài tập Thoát hiểm tầng 3' }).click();
  await page.getByRole('radio', { name: 'Đánh giá' }).click();
  await expect(page.getByText('Sẵn sàng tải gói nhiệm vụ')).toBeVisible();
  await expect(page.getByText(/Cần ứng dụng FET3D cho Android/)).toBeVisible();
  expect(prepareCalls).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('result screen waits for sync, then shows the server result', async ({ page }) => {
  let completed = false;
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(json({ accessToken: 'access', refreshToken: 'refresh', user })),
  );
  await page.route('**/api/me/avatar', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route(
    (url) => url.pathname === '/api/training/sessions',
    (route) =>
      route.fulfill(
        json({
          items: [
            {
              sessionId,
              status: 'AwaitingSync',
              mode: 'Assessment',
              resultStatus: null,
              endReason: 'Finished',
              startedAt: '2026-10-19T08:00:00Z',
              endedAt: null,
              training: { id: trainingId, name: 'Thoát hiểm tầng 3' },
              building: { id: buildingId, name: 'Tòa nhà B' },
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 20,
        }),
      ),
  );
  await page.route(`**/api/training/sessions/${sessionId}`, (route) =>
    route.fulfill(
      json(
        session(
          completed
            ? { status: 'Completed', hasResult: true }
            : { status: 'AwaitingSync', hasResult: false },
        ),
      ),
    ),
  );
  await page.route(`**/api/training/sessions/${sessionId}/result`, (route) =>
    completed
      ? route.fulfill(
          json({
            sessionId,
            mode: 'Assessment',
            outcome: 'Passed',
            reason: 'ALL_REQUIREMENTS_MET',
            scorePercent: 85,
            passThresholdPercent: 70,
            criteria: [
              {
                id: 'c1',
                label: 'Đến lối thoát',
                metric: 'reached_exit',
                passed: true,
                reason: null,
              },
            ],
            lastEventSequence: 42,
            createdAt: '2026-10-19T08:20:00Z',
          }),
        )
      : route.fulfill(json({ code: 'RESULT_NOT_READY', title: 'Not ready' }, 409)),
  );

  await page.goto('/login');
  await login(page);
  await page.getByRole('tab', { name: 'Kết quả' }).click();
  await page.getByRole('button', { name: /Chờ đồng bộ/ }).click();
  await expect(page.getByText('Đang xử lý kết quả')).toBeVisible();
  await expect(page.getByText(/sự kiện|Unity|%/)).toHaveCount(0);

  completed = true;
  await page.getByRole('button', { name: 'Đồng bộ lại' }).click();
  await expect(page.getByText('ĐẠT', { exact: true })).toBeVisible();
  await expect(page.getByText('85%', { exact: true })).toBeVisible();
  await expect(page.getByText(/Mức yêu cầu 70%/)).toBeVisible();
  await expect(page.getByText('Bạn đạt mọi yêu cầu của bài đánh giá.')).toBeVisible();
  await expect(page.getByText(/Đến lối thoát/)).toBeVisible();
  await expect(page.getByText('Đang xử lý kết quả')).toHaveCount(0);
  await expect(page.getByText(/ALL_REQUIREMENTS_MET|reached_exit/)).toHaveCount(0);
});

type ResultCase = {
  name: string;
  result: Record<string, unknown>;
  visible: (string | RegExp)[];
  hidden: RegExp;
  primary: string;
};

const RESULT_CASES: ResultCase[] = [
  {
    name: 'not passed: both numbers, Vietnamese metric names, missing data is not a mistake',
    result: {
      outcome: 'NotPassed',
      reason: 'BELOW_PASS_THRESHOLD',
      scorePercent: 60,
      passThresholdPercent: 70,
      criteria: [
        { id: 'c1', label: null, metric: 'wrong_exits', passed: false, reason: null },
        {
          id: 'c2',
          label: null,
          metric: 'hazard_exposure',
          passed: false,
          reason: 'METRIC_UNAVAILABLE',
        },
      ],
    },
    visible: [
      'CHƯA ĐẠT',
      'Điểm 60% thấp hơn mức yêu cầu 70%.',
      'Số lần đi nhầm lối',
      'Mức tiếp xúc nguy hiểm',
      'Chưa đủ dữ liệu đánh giá',
    ],
    hidden: /wrong_exits|hazard_exposure|METRIC_UNAVAILABLE|BELOW_PASS_THRESHOLD/,
    primary: 'Quét QR để chơi lại',
  },
  {
    name: 'incomplete',
    result: {
      outcome: 'Incomplete',
      reason: 'ENDED_BEFORE_COMPLETION',
      scorePercent: null,
      criteria: null,
    },
    visible: ['CHƯA HOÀN THÀNH', 'Phiên kết thúc trước khi hoàn thành tình huống.'],
    hidden: /ENDED_BEFORE_COMPLETION|Incomplete/,
    primary: 'Quét QR để chơi lại',
  },
  {
    name: 'practice mode is not scored',
    result: {
      mode: 'Guided',
      outcome: 'NotAssessed',
      reason: 'MODE_NOT_ASSESSED',
      scorePercent: null,
      passThresholdPercent: null,
      criteria: null,
    },
    visible: ['KHÔNG CHẤM ĐIỂM', /Chọn Đánh giá để được chấm/],
    hidden: /MODE_NOT_ASSESSED|NotAssessed/,
    primary: 'Quét QR để chơi lại',
  },
  {
    name: 'unknown outcome, reason and metric stay neutral',
    result: {
      outcome: 'Certified',
      reason: 'SOMETHING_NEW',
      criteria: [{ id: 'c1', label: null, metric: 'zz_metric', passed: true, reason: 'ODD' }],
    },
    visible: [
      'KẾT QUẢ CHƯA XÁC ĐỊNH',
      'Kết quả do FET3D chấm theo tiêu chí của bài.',
      'Tiêu chí của bài',
    ],
    hidden: /Certified|SOMETHING_NEW|zz_metric|ODD/,
    primary: 'Quét QR để chơi lại',
  },
];

for (const item of RESULT_CASES)
  test(`history result: ${item.name}`, async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill(json({ accessToken: 'access', refreshToken: 'refresh', user })),
    );
    await page.route('**/api/me/avatar', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route(`**/api/training/sessions/${sessionId}/result`, (route) =>
      route.fulfill(
        json({
          sessionId,
          mode: 'Assessment',
          scorePercent: 85,
          passThresholdPercent: 70,
          lastEventSequence: 42,
          createdAt: '2026-10-19T08:20:00Z',
          ...item.result,
        }),
      ),
    );
    await page.goto('/login');
    await login(page);
    await page.goto(`/history/${sessionId}?trainingId=${trainingId}`);
    for (const text of item.visible)
      await expect(
        typeof text === 'string' ? page.getByText(text, { exact: true }) : page.getByText(text),
      ).toBeVisible();
    await expect(page.getByText(item.hidden)).toHaveCount(0);
    await expect(page.getByRole('button', { name: item.primary })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Về trang chủ' })).toBeVisible();
  });

test('history result offers replay when the training is in "Bài đã tải"', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill(json({ accessToken: 'access', refreshToken: 'refresh', user })),
  );
  await page.route('**/api/me/avatar', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route(`**/api/training/sessions/${sessionId}/result`, (route) =>
    route.fulfill(
      json({
        sessionId,
        mode: 'Assessment',
        outcome: 'Passed',
        reason: 'ALL_REQUIREMENTS_MET',
        scorePercent: 90,
        passThresholdPercent: 70,
        criteria: [],
        lastEventSequence: 42,
        createdAt: '2026-10-19T08:20:00Z',
      }),
    ),
  );
  await page.route(`**/api/qr/${token}`, (route) =>
    route.fulfill(json({ code: 'QR_REVOKED', title: 'Gone' }, 410)),
  );
  await page.goto('/login');
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    `fire3d.training.downloads.v1.${user.id}`,
    JSON.stringify({
      version: 1,
      items: [
        {
          trainingId,
          trainingName: 'Thoát hiểm tầng 3',
          buildingId,
          buildingName: 'Tòa nhà B',
          qrToken: token,
          releaseId: '33333333-3333-4333-8333-333333333333',
          manifestHash: hash('b'),
          runtimeVersion: '2.0.2',
          savedAt: '2026-10-29T08:00:00.000Z',
        },
      ],
    }),
  ] as const);
  await login(page);
  await page.goto(`/history/${sessionId}?trainingId=${trainingId}`);
  await page.getByRole('button', { name: 'Chơi lại' }).click();
  await expect(page).toHaveURL(new RegExp(`/training/${trainingId}`));
  // Replay re-checks the QR online: a revoked QR never opens the downloaded game.
  await expect(page.getByText('Mã QR này đã bị thu hồi')).toBeVisible();
});
