import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Play,
  RefreshCw,
  ScanLine,
  X,
} from 'lucide-react-native';
import {
  cachedPlaytestPackage,
  cancelPlaytest,
  getPlaytest,
  launchPlaytest,
  preparePlaytestPackage,
  type PlaytestStatus,
  type PreparedPlaytest,
} from '@/api/playtest';
import { Brand, Button } from '@/components/ui/Button';
import {
  Callout,
  Card,
  Field,
  HexBadge,
  ProgressRing,
  Ribbon,
  Segments,
} from '@/components/ui/Game';
import { Notice, Screen } from '@/components/ui/Screen';
import { StateView } from '@/components/ui/StateScreen';
import { Text } from '@/components/ui/Text';
import {
  describePlaytestProblem,
  playtestStep,
  problemCode,
  selectPlaytestModes,
} from '@/features/playtest/playtest-flow';
import { readRecentPlaytest } from '@/features/playtest/recent-playtest';
import { parseHandoffCode } from '@/features/qr/qr-token';
import { ModeCard } from '@/features/training/components/PrepareParts';
import { getLaunch } from '@/features/training/event-queue.native';
import {
  PackageDownloadCancelled,
  PackageNotReady,
  type PackageProgress,
} from '@/features/training/package-cache.native';
import { formatBytes, type TrainingMode } from '@/features/training/session-contract';
import {
  pumpTrainingRuntime,
  subscribeTrainingRuntime,
} from '@/features/training/training-runtime';
import { UNITY_UNAVAILABLE_MESSAGE, unityBridge } from '@/features/training/unity-bridge.native';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

const STATUS_LABELS: Record<PlaytestStatus['status'], string> = {
  Created: 'Chưa bắt đầu',
  Launching: 'Đang mở Unity',
  Running: 'Đang chạy',
  Completed: 'Đã hoàn tất',
  Cancelled: 'Đã hủy',
};

const RECOVERY_LABELS: Record<string, string> = {
  PLAYTEST_GRANT_EXPIRED: 'Unity mở sau khi grant hết hạn nên lần mở đó đã bị dừng.',
  PLAYTEST_GRANT_STALE: 'Lần mở trước dùng grant cũ nên đã bị dừng.',
  RUNTIME_MISMATCH: 'Unity trong ứng dụng không khớp runtime đã gửi máy chủ.',
  CALLBACK_REJECTED: 'Unity gửi dữ liệu sai hợp đồng; dữ liệu được giữ trên máy để hỗ trợ.',
  EVENTS_STALLED: 'Đồng bộ sự kiện không tiến triển; đã dừng tự động thử lại.',
  PLAYTEST_EVENTS_INCOMPLETE: 'Máy chủ thiếu sự kiện mà máy này không còn giữ.',
  PLAYTEST_SESSION_MISMATCH: 'Playtest không còn gắn với phiên đăng nhập này.',
};

type Download = { progress: PackageProgress | null } | null;

export default function PlaytestScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { account, signOut } = useSession();
  const [playtestId, setPlaytestId] = useState<string | null>(typeof id === 'string' ? id : null);
  const [status, setStatus] = useState<PlaytestStatus | null>(null);
  const [prepared, setPrepared] = useState<PreparedPlaytest | null>(null);
  const [download, setDownload] = useState<Download>(null);
  const [unitySession, setUnitySession] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [mode, setMode] = useState<TrainingMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [handoffInput, setHandoffInput] = useState('');
  const abort = useRef<AbortController | null>(null);
  const working = useRef(false);

  useEffect(() => {
    if (!playtestId && account) void readRecentPlaytest(account.id).then(setPlaytestId);
  }, [account?.id, playtestId]);
  useEffect(() => {
    if (typeof id === 'string') setPlaytestId(id);
  }, [id]);

  /** BE status plus what this device knows: verified package, Unity session, local recovery. Never starts anything. */
  const refresh = useCallback(async (): Promise<PlaytestStatus | null> => {
    if (!playtestId) return null;
    try {
      const next = await getPlaytest(playtestId);
      setStatus(next);
      if (unityBridge.available) {
        setUnitySession(await unityBridge.activeSession().catch(() => null));
        const launch = await getLaunch(playtestId).catch(() => null);
        setRecoveryCode(launch?.sync_state === 'recovery' ? launch.recovery_code : null);
      }
      return next;
    } catch (issue) {
      setError(describePlaytestProblem(issue, 'Không tải được playtest.'));
      return null;
    }
  }, [playtestId]);

  // Restores a package already verified on this device (resume after leaving the screen); never downloads.
  useEffect(() => {
    setPrepared(null);
    setStatus(null);
    setError('');
    setNotice('');
    let active = true;
    void (async () => {
      const next = await refresh();
      if (!active || !next?.launchSession || !unityBridge.available) return;
      if (next.status !== 'Created' && next.status !== 'Launching') return;
      const cached = await cachedPlaytestPackage(next).catch(() => null);
      if (active && cached) setPrepared(cached);
    })();
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => () => abort.current?.abort(), []);

  // Mode from the verified scenario: Guided when allowed, else the first allowed, else every runtime mode.
  const choice = prepared ? selectPlaytestModes(prepared.scenario) : null;
  useEffect(() => {
    setMode((current) =>
      choice && current && choice.modes.includes(current) ? current : (choice?.preferred ?? null),
    );
  }, [prepared]);

  // Unity callbacks and sync results for this playtest (the device-wide loop persists and syncs them).
  useEffect(() => {
    if (!playtestId) return;
    return subscribeTrainingRuntime((event) => {
      if (event.kind === 'runtime-mismatch') {
        setError(describePlaytestProblem({ code: 'RUNTIME_MISMATCH' }, event.message));
        return;
      }
      if (event.kind === 'playtest-synced' && event.playtestId === playtestId) {
        if (event.result.kind === 'completed') {
          setStatus(event.result.status);
          setNotice('Đã đồng bộ kết quả playtest. Web hiển thị kết quả này.');
        } else if (event.result.kind === 'recovery') void refresh();
        return;
      }
      if (event.kind === 'sync-failed' && event.sessionId === playtestId) {
        setNotice(event.message);
        return;
      }
      if (event.kind !== 'unity') return;
      const message = event.message;
      if (message.sessionId && message.sessionId !== playtestId) return;
      if (message.type === 'Error') {
        const payload = (message.payload ?? {}) as { code?: string; message?: string };
        if (payload.code === 'LAUNCH_CANCELLED') setNotice('Đã hủy mở màn chơi.');
        else
          setError(
            describePlaytestProblem(
              { code: payload.code },
              `Unity báo lỗi ${payload.code ?? ''}: ${payload.message ?? 'không rõ'}`.trim(),
            ),
          );
      }
      if (['Launched', 'Error', 'Exited', 'Completed', 'Rejected'].includes(message.type))
        void refresh();
    });
  }, [playtestId, refresh]);

  async function prepare() {
    if (!status || abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setError('');
    setNotice('');
    setDownload({ progress: null });
    try {
      setPrepared(
        await preparePlaytestPackage(status, {
          signal: controller.signal,
          onProgress: (progress) => setDownload({ progress }),
        }),
      );
    } catch (issue) {
      if (issue instanceof PackageDownloadCancelled) setNotice(issue.message);
      else {
        setError(describePlaytestProblem(issue, 'Không tải được package playtest.'));
        // The Web may have cancelled it or moved it to another session since this screen loaded: show the current state.
        if (problemCode(issue) === 'PACKAGE_SESSION_NOT_ACTIVE') void refresh();
      }
    } finally {
      abort.current = null;
      setDownload(null);
    }
  }

  /** "Bắt đầu playtest" and "Thử mở lại": the only actions that call /start or /launch-grants and open Unity. */
  async function launch() {
    if (!account || !playtestId || !prepared || !mode || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      // Status right before: the Web or another device may have changed it since this screen loaded.
      const current = await getPlaytest(playtestId);
      setStatus(current);
      await launchPlaytest(current, mode, account.id, prepared.manifestPath);
    } catch (issue) {
      if (issue instanceof PackageNotReady) {
        // Back to "Chuẩn bị": downloading again resumes from the files that still match.
        setPrepared(null);
        setError(issue.message);
      } else setError(describePlaytestProblem(issue, 'Không mở được playtest.'));
    } finally {
      working.current = false;
      setBusy(false);
      void refresh();
    }
  }

  async function backToUnity() {
    try {
      if (!(await unityBridge.show())) {
        setNotice('Unity đã đóng. Dữ liệu đã ghi được giữ trên máy và sẽ được đồng bộ.');
        void pumpTrainingRuntime();
      }
    } catch (issue) {
      setError(describePlaytestProblem(issue, 'Không mở lại được Unity.'));
    } finally {
      void refresh();
    }
  }

  async function cancel() {
    if (!playtestId || !account || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      setStatus(await cancelPlaytest(account.id, playtestId));
    } catch (issue) {
      setError(describePlaytestProblem(issue, 'Không hủy được playtest.'));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const step = status
    ? playtestStep(status, {
        packageReady: !!prepared,
        unityAlive: unitySession === status.id,
      })
    : null;
  const progress = download?.progress ?? null;
  const percent =
    progress && progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.bytesDone / progress.totalBytes) * 100))
      : 0;
  const canLaunch = step?.name === 'start' || step?.name === 'retry-launch';
  const grantExpired =
    step?.name === 'retry-launch' &&
    (recoveryCode === 'PLAYTEST_GRANT_EXPIRED' || recoveryCode === 'PLAYTEST_GRANT_STALE');
  const initials = (account?.fullName || account?.username || account?.email || 'OU')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

  function openHandoff() {
    const code = parseHandoffCode(handoffInput);
    if (!code) {
      setError(
        'Đây không phải mã bàn giao playtest. Dán đường dẫn hiện trong tab Playtest trên Web.',
      );
      return;
    }
    setHandoffInput('');
    router.replace({ pathname: '/playtest/handoff', params: { code } });
  }

  const cancelButton = status?.recovery.canCancel && step?.name !== 'final' && (
    <Button
      title="Hủy playtest"
      variant="danger"
      size="sm"
      disabled={busy || !!download}
      onPress={() => void cancel()}
    />
  );
  const refreshButton = (
    <Button
      title="Cập nhật trạng thái"
      icon={RefreshCw}
      variant="secondary"
      size="sm"
      disabled={busy}
      onPress={() => void refresh()}
    />
  );

  const footer = !playtestId ? (
    <>
      <Button
        title="Nhận playtest"
        icon={ArrowUpRight}
        disabled={!handoffInput.trim()}
        onPress={openHandoff}
      />
      <Button title="Đăng xuất" variant="danger" size="sm" onPress={() => void signOut()} />
    </>
  ) : step?.name === 'final' || step?.name === 'not-launch-session' ? (
    <>
      <Button
        title="Quét mã bàn giao khác"
        icon={ScanLine}
        onPress={() => router.push('/scan-qr')}
      />
      <Button title="Đăng xuất" variant="danger" size="sm" onPress={() => void signOut()} />
    </>
  ) : download ? (
    <Button title="Hủy tải" variant="secondary" onPress={() => abort.current?.abort()} />
  ) : step?.name === 'prepare' ? (
    <>
      <Button
        title="Tải và kiểm tra gói"
        icon={ArrowUpRight}
        disabled={busy || !unityBridge.available}
        onPress={() => void prepare()}
      />
      {cancelButton}
    </>
  ) : canLaunch ? (
    <>
      <Button
        title={
          grantExpired
            ? 'Cấp lại và mở Unity'
            : step?.name === 'start'
              ? 'Bắt đầu playtest'
              : 'Thử mở lại'
        }
        icon={grantExpired || step?.name === 'retry-launch' ? RefreshCw : Play}
        loading={busy}
        disabled={busy || !mode}
        onPress={() => void launch()}
      />
      {cancelButton}
    </>
  ) : step ? (
    <>
      {refreshButton}
      {cancelButton}
    </>
  ) : undefined;

  const stepIndex = !step ? 1 : step.name === 'prepare' ? 2 : canLaunch ? 3 : 4;

  return (
    <Screen footer={footer} contentStyle={{ padding: 16, gap: 14 }}>
      <View style={styles.top}>
        <Brand size="sm" />
        <Text style={styles.topTitle}>Playtest tổ chức</Text>
        <View style={styles.avatar} accessibilityLabel={`Tài khoản ${account?.email ?? ''}`}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      </View>
      {!status && !!playtestId && !error && <ActivityIndicator color={colors.ember} />}
      {!!notice && <Callout tone="info">{notice}</Callout>}
      {!!error && <Notice error>{error}</Notice>}

      {!playtestId && (
        <>
          <Text variant="title">Quét mã bàn giao</Text>
          <Text muted>
            Mở playtest trên Web, bấm “Chạy thử trên điện thoại” rồi quét mã QR. Mã có hiệu lực 5
            phút.
          </Text>
          <Card
            accessibilityLabel="Quét mã bàn giao"
            onPress={() => router.push('/scan-qr')}
            contentStyle={styles.scanCard}
          >
            <HexBadge icon={ScanLine} size={72} />
            <Text style={styles.scanText}>Đưa mã QR vào khung</Text>
          </Card>
          <Field
            label="Mã bàn giao"
            value={handoffInput}
            onChangeText={setHandoffInput}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Dán đường dẫn hoặc mã 43 ký tự"
            onSubmitEditing={openHandoff}
          />
        </>
      )}

      {status && step && (
        <>
          {!!recoveryCode && step.name !== 'final' && !grantExpired && (
            <Callout tone="danger">
              {RECOVERY_LABELS[recoveryCode] ?? `Đồng bộ dừng (${recoveryCode}).`}
            </Callout>
          )}
          {!unityBridge.available && step.name !== 'final' && (
            <Notice error>{UNITY_UNAVAILABLE_MESSAGE}</Notice>
          )}

          {step.name === 'not-launch-session' && (
            <StateView
              icon={X}
              tone="danger"
              ribbon="Khác phiên đăng nhập"
              title="Playtest không thuộc phiên này"
              body="Phiên đăng nhập này không phải phiên đã nhận playtest. Tạo mã bàn giao mới trên Web cho thiết bị này."
            />
          )}

          {(step.name === 'prepare' || !!download) && (
            <>
              <Ribbon label="Playtest đã nhận" />
              <Text variant="heading">{STATUS_LABELS[status.status] ?? status.status}</Text>
              <Card contentStyle={{ gap: 0 }}>
                {[
                  ['Nhận mã bàn giao', 'Đã nhận'],
                  ['Tải và kiểm tra gói', 'Không dùng lượt thử ở bước này'],
                  ['Chọn chế độ & bắt đầu', 'Dùng một lượt thử hoặc gói trả phí của tòa nhà'],
                  ['Chơi trong Unity', ''],
                ].map(([title, hint], i) => (
                  <StepItem
                    key={title}
                    index={i + 1}
                    title={title}
                    hint={hint}
                    state={i + 1 < stepIndex ? 'done' : i + 1 === stepIndex ? 'active' : 'pending'}
                    last={i === 3}
                  />
                ))}
              </Card>
              {download && (
                <Card contentStyle={{ gap: 10 }} accessibilityLabel={`Đã tải ${percent}%`}>
                  <Text variant="strong">Gói tập huấn</Text>
                  <Segments total={10} filled={percent / 10} style={{ width: 180 }} />
                  <Text variant="small" muted>
                    {progress?.phase === 'verifying'
                      ? 'Đang kiểm tra SHA-256…'
                      : progress?.phase === 'checking'
                        ? 'Đang kiểm tra phần đã tải…'
                        : progress
                          ? `${formatBytes(progress.bytesDone)} / ${formatBytes(progress.totalBytes)} · tệp ${progress.fileIndex}/${progress.fileCount}`
                          : 'Đang lấy danh sách tệp…'}
                  </Text>
                </Card>
              )}
            </>
          )}

          {canLaunch && choice && !grantExpired && (
            <>
              <Ribbon label="Gói sẵn sàng" color={colors.exit} shadow="#1F6B44" />
              <Text variant="title">Chọn chế độ chạy thử</Text>
              <View style={{ gap: 14 }} accessibilityRole="radiogroup">
                {choice.modes.length === 0 && (
                  <Notice error>Kịch bản không cho phép chế độ nào mà runtime hỗ trợ.</Notice>
                )}
                {choice.modes.map((item) => (
                  <ModeCard
                    key={item}
                    mode={item}
                    selected={item === mode}
                    disabled={busy}
                    onPress={() => setMode(item)}
                  />
                ))}
              </View>
              <Callout tone="warning">
                {step.name === 'start'
                  ? 'Bắt đầu sẽ dùng một lượt thử (hoặc gói trả phí) của tòa nhà. Playtest không tính vào thống kê học viên.'
                  : 'Playtest đã bắt đầu nhưng Unity chưa mở được. Thử mở lại xin quyền mới, không dùng thêm lượt thử.'}
              </Callout>
            </>
          )}

          {grantExpired && (
            <StateView
              icon={CircleAlert}
              tone="warning"
              ribbon="Cần cấp lại quyền"
              title="Quyền chạy đã hết hạn"
              body="Playtest chưa mở được vì quyền chạy ngắn hạn đã hết. Cấp lại quyền không dùng thêm lượt thử."
            />
          )}

          {step.name === 'wait-launch' && (
            <View style={styles.center}>
              <ProgressRing value={0.35} size={160} stroke={20} />
              <Ribbon label="Đang mở Unity" />
              <Text style={styles.stateTitle}>Đang chờ máy chủ xác nhận</Text>
              <Text muted style={styles.stateBody}>
                FET3D đang xác nhận Unity đã mở. Cập nhật trạng thái sau ít phút.
              </Text>
            </View>
          )}

          {step.name === 'back-to-unity' && (
            <Card accent contentStyle={styles.playing}>
              <HexBadge icon={Play} size={96} />
              <Ribbon label="Đang chạy" />
              <Text style={styles.stateTitle}>Playtest đang mở trong Unity</Text>
              <Text muted style={styles.stateBody}>
                {status.acknowledgedSequence} sự kiện đã lưu. Chạy thử không tính vào thống kê học
                viên.
              </Text>
              <Button
                title="Quay lại Unity"
                icon={Play}
                style={{ alignSelf: 'stretch' }}
                onPress={() => void backToUnity()}
              />
            </Card>
          )}

          {step.name === 'running-elsewhere' && (
            <StateView
              icon={CircleAlert}
              tone="warning"
              ribbon="Unity đã đóng"
              title="Playtest không còn chạy trên máy"
              body="Sự kiện đã ghi sẽ được đồng bộ; playtest không được tự chạy lại."
            />
          )}

          {step.name === 'final' &&
            (step.state === 'Completed' ? (
              <StateView
                icon={Check}
                tone="exit"
                ribbon="Playtest hoàn tất"
                title={
                  status.completion
                    ? `Đã ghi nhận ${status.completion.lastEventSequence} sự kiện`
                    : 'Playtest đã hoàn tất'
                }
                body="Muốn chạy lại, hãy tạo playtest mới trên Web. Kết quả xem trong khu quản lý tổ chức."
              />
            ) : (
              <StateView
                icon={X}
                tone="neutral"
                ribbon="Đã hủy"
                title="Playtest đã bị hủy"
                body="Muốn chạy lại, hãy tạo playtest mới trên Web."
              />
            ))}
        </>
      )}
    </Screen>
  );
}

function StepItem({
  index,
  title,
  hint,
  state,
  last,
}: {
  index: number;
  title: string;
  hint: string;
  state: 'done' | 'active' | 'pending';
  last?: boolean;
}) {
  return (
    <View style={styles.stepItem}>
      <View style={{ alignItems: 'center' }}>
        <View
          style={[
            styles.stepBox,
            state === 'done' && {
              borderColor: colors.success,
              backgroundColor: colors.successSoft,
            },
            state === 'active' && { borderColor: colors.ember, backgroundColor: colors.ember },
          ]}
        >
          {state === 'done' ? (
            <Check size={14} color={colors.success} strokeWidth={3} />
          ) : (
            <Text
              style={[styles.stepNumber, state === 'active' && { color: colors.emberForeground }]}
            >
              {index}
            </Text>
          )}
        </View>
        {!last && (
          <View
            style={[styles.stepLine, state === 'done' && { backgroundColor: colors.success }]}
          />
        )}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
        <Text
          style={[
            styles.stepTitle,
            state === 'active' && { color: colors.ember },
            state === 'pending' && { color: colors.dim },
          ]}
        >
          {title}
        </Text>
        {!!hint && (
          <Text variant="small" muted>
            {hint}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topTitle: { flex: 1, fontFamily: fonts.black, fontSize: 17, lineHeight: 23 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.black, fontSize: 13, lineHeight: 18, color: colors.ember },
  scanCard: { alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200 },
  scanText: { fontFamily: fonts.extrabold, fontSize: 14, lineHeight: 19, color: colors.muted },
  center: { alignItems: 'center', gap: 14, paddingVertical: 24 },
  stateTitle: { fontFamily: fonts.black, fontSize: 20, lineHeight: 27, textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  playing: { alignItems: 'center', gap: 12, padding: 20, backgroundColor: colors.surfaceRaised },
  stepItem: { flexDirection: 'row', gap: 12 },
  stepBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { fontFamily: fonts.black, fontSize: 13, lineHeight: 17, color: colors.dim },
  stepLine: { width: 2, flex: 1, minHeight: 14, backgroundColor: colors.lineStrong },
  stepTitle: { fontFamily: fonts.extrabold, fontSize: 14, lineHeight: 20 },
});
