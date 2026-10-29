import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ArrowUpRight, Check, Info, Play, RefreshCw, User } from 'lucide-react-native';
import { ApiError } from '@/api';
import {
  getQrTrainings,
  resolveBuildingQr,
  type BuildingQrResolution,
  type Training,
} from '@/api/qr';
import {
  assertTrainingPackageReady,
  downloadTrainingPackage,
  getTrainingSession,
  launchStartedSession,
  prepareTrainingSession,
  startTrainingSession,
  type TrainingSession,
} from '@/api/training';
import { Button } from '@/components/ui/Button';
import { Callout, Card, HexBadge, ProgressRing, Ribbon, StepRow } from '@/components/ui/Game';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { StateScreen } from '@/components/ui/StateScreen';
import { Text } from '@/components/ui/Text';
import {
  bindPreparedSession,
  clearAttempt,
  getOrCreateAttempt,
  readAttempt,
  rotateStartKey,
  type TrainingAttempt,
} from '@/features/training/attempt-store';
import {
  cachedPackagePath,
  PackageDownloadCancelled,
  PackageNotReady,
  type PackageProgress,
} from '@/features/training/package-cache.native';
import {
  allowedTrainingModes,
  describeTrainingProblem,
  formatBytes,
  pinFromSession,
  type TrainingMode,
} from '@/features/training/session-contract';
import { isOfflineError, subscribeTrainingRuntime } from '@/features/training/training-runtime';
import { UNITY_UNAVAILABLE_MESSAGE, unityBridge } from '@/features/training/unity-bridge.native';
import { useSession } from '@/store/SessionProvider';
import { ModeCard, PrepareSteps, SummaryRows } from '@/features/training/components/PrepareParts';
import { modeName } from '@/features/training/mode-ui';
import { colors, fonts } from '@/theme/tokens';

type Phase =
  | { name: 'pick' }
  | { name: 'prepared'; session: TrainingSession }
  | { name: 'downloading'; session: TrainingSession; progress: PackageProgress | null }
  | { name: 'ready'; session: TrainingSession; manifestPath: string }
  | { name: 'playing'; session: TrainingSession; manifestPath: string };

const ACTIVE = ['Launching', 'Running'];
const ENDED = ['AwaitingSync', 'Completed'];

function describe(issue: unknown, fallback: string): string {
  if (issue instanceof PackageDownloadCancelled) return issue.message;
  if (issue instanceof ApiError)
    return describeTrainingProblem(issue.payload?.code, issue.status, issue.message);
  if (isOfflineError(issue))
    return 'Không có kết nối mạng. Cần mạng để chuẩn bị, tải gói và bắt đầu phiên mới.';
  return issue instanceof Error ? issue.message : fallback;
}

export default function TrainingScreen() {
  const params = useLocalSearchParams<{ trainingId: string; qr?: string; mode?: string }>();
  const trainingId = typeof params.trainingId === 'string' ? params.trainingId : '';
  const qr = typeof params.qr === 'string' ? params.qr : '';
  const { account } = useSession();
  const [training, setTraining] = useState<Training | null>(null);
  const [building, setBuilding] = useState<BuildingQrResolution | null>(null);
  const [mode, setMode] = useState<TrainingMode | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'pick' });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [offline, setOffline] = useState(false);
  const [seatsFull, setSeatsFull] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [packageBytes, setPackageBytes] = useState<number | null>(null);
  const attempt = useRef<TrainingAttempt | null>(null);
  const abort = useRef<AbortController | null>(null);
  const modes = allowedTrainingModes(training?.allowedModes);

  const load = useCallback(async () => {
    if (!qr) {
      setError('Hãy mở bài tập từ QR của Building.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [resolved, list] = await Promise.all([resolveBuildingQr(qr), getQrTrainings(qr)]);
      setBuilding(resolved);
      const found = list.find((item) => item.id === trainingId) ?? null;
      setTraining(found);
      if (!found) setError('Bài tập không còn trong danh sách được phép của Building.');
      const allowed = allowedTrainingModes(found?.allowedModes);
      setMode((current) =>
        current && allowed.includes(current)
          ? current
          : allowed.includes(params.mode as TrainingMode)
            ? (params.mode as TrainingMode)
            : allowed.length === 1
              ? allowed[0]
              : null,
      );
    } catch (issue) {
      setError(describe(issue, 'Không tải được bài tập.'));
    } finally {
      setLoading(false);
    }
  }, [qr, trainingId, params.mode]);

  useEffect(() => {
    void load();
  }, [load]);

  // Leaving the screen stops the download; verified files stay on the device and the next visit resumes from them.
  useEffect(() => () => abort.current?.abort(), []);

  /** Restores an unfinished attempt of this mode (crash, back navigation) without creating anything. */
  useEffect(() => {
    if (!account || !mode || !trainingId) return;
    let active = true;
    setPhase({ name: 'pick' });
    setNotice('');
    attempt.current = null;
    void (async () => {
      const stored = await readAttempt(account.id, trainingId, mode);
      if (!active || !stored?.sessionId) return;
      attempt.current = stored;
      try {
        const session = await getTrainingSession(stored.sessionId);
        if (!active) return;
        if (session.status === 'Prepared') await showPrepared(session);
        else if (ENDED.includes(session.status) || ACTIVE.includes(session.status)) {
          setNotice('Bạn có một phiên trước của chế độ này chưa xem kết quả.');
          setPhase({ name: 'pick' });
        } else await clearAttempt(account.id, trainingId, mode);
      } catch {
        // Offline or the preparation vanished: the Trainee can prepare again explicitly.
      }
    })();
    return () => {
      active = false;
    };
  }, [account?.id, trainingId, mode]);

  async function showPrepared(session: TrainingSession) {
    pinFromSession(session);
    if (unityBridge.available) {
      const cached = await cachedPackagePath(pinFromSession(session)).catch(() => null);
      if (cached) {
        setPhase({ name: 'ready', session, manifestPath: cached });
        return;
      }
    }
    setPhase({ name: 'prepared', session });
  }

  async function prepare() {
    if (!account || !mode || !training) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let current = await getOrCreateAttempt(account.id, training.id, mode);
      let session = await getTrainingSession(
        (await prepareTrainingSession(training.id, mode, current.prepareKey)).id,
      );
      if (session.status !== 'Prepared') {
        // The key replayed an expired or already played preparation: this is a new attempt with a new key.
        await clearAttempt(account.id, training.id, mode);
        current = await getOrCreateAttempt(account.id, training.id, mode);
        session = await getTrainingSession(
          (await prepareTrainingSession(training.id, mode, current.prepareKey)).id,
        );
        if (session.status !== 'Prepared')
          throw new Error('BE không trả phiên chuẩn bị mới. Hãy thử lại.');
      }
      attempt.current = await bindPreparedSession(account.id, current, session.id);
      await showPrepared(session);
    } catch (issue) {
      setError(describe(issue, 'Không chuẩn bị được phiên.'));
    } finally {
      setBusy(false);
    }
  }

  async function download(session: TrainingSession) {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setError('');
    setPhase({ name: 'downloading', session, progress: null });
    try {
      const manifestPath = await downloadTrainingPackage(session, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.totalBytes > 0) setPackageBytes(progress.totalBytes);
          setPhase({ name: 'downloading', session, progress });
        },
      });
      setPhase({ name: 'ready', session, manifestPath });
    } catch (issue) {
      setPhase({ name: 'prepared', session });
      setError(describe(issue, 'Không tải được package.'));
    } finally {
      abort.current = null;
    }
  }

  async function start(session: TrainingSession, manifestPath: string) {
    if (!account || !mode || !attempt.current?.startKey) return;
    setBusy(true);
    setError('');
    setNotice('');
    setOffline(false);
    setLaunched(false);
    try {
      if (unityBridge.available) await assertTrainingPackageReady(session, manifestPath);
      const started = await startTrainingSession(session, attempt.current.startKey, async () => {
        attempt.current = await rotateStartKey(account.id, attempt.current!);
        return attempt.current.startKey!;
      });
      setPhase({ name: 'playing', session: started.session, manifestPath });
      await launchStartedSession(started, manifestPath, 0, account.id);
    } catch (issue) {
      if (issue instanceof PackageNotReady) {
        setPhase({ name: 'prepared', session });
        setError(issue.message);
        return;
      }
      setPhase({ name: 'ready', session, manifestPath });
      if (isOfflineError(issue)) setOffline(true);
      else if (issue instanceof ApiError && issue.payload?.code === 'LEARNER_LIMIT_REACHED')
        setSeatsFull(true);
      else setError(describe(issue, 'Không bắt đầu được phiên.'));
    } finally {
      setBusy(false);
    }
  }

  const playingId = phase.name === 'playing' ? phase.session.id : null;
  useEffect(() => {
    if (!playingId || phase.name !== 'playing') return;
    const current = phase;
    let launched = false;
    const openResult = () =>
      router.replace({
        pathname: '/training/session/[sessionId]',
        params: { sessionId: current.session.id, trainingId, qr, mode: current.session.mode },
      });
    return subscribeTrainingRuntime((event) => {
      if (event.kind === 'runtime-mismatch') {
        setError(event.message);
        return;
      }
      if (event.kind !== 'unity') return;
      const message = event.message;
      if (message.sessionId && message.sessionId !== current.session.id) return;
      if (message.type === 'Launched') {
        launched = true;
        setLaunched(true);
      } else if (message.type === 'Completed') openResult();
      else if (message.type === 'Error') {
        const payload = (message.payload ?? {}) as { code?: string; message?: string };
        if (payload.code === 'LAUNCH_CANCELLED') setNotice('Đã hủy mở màn chơi.');
        else
          setError(`Unity báo lỗi ${payload.code ?? ''}: ${payload.message ?? 'không rõ'}`.trim());
        if (!launched)
          setPhase({ name: 'ready', session: current.session, manifestPath: current.manifestPath });
      } else if (message.type === 'Exited') {
        if (launched) openResult();
        else
          setPhase({ name: 'ready', session: current.session, manifestPath: current.manifestPath });
      }
    });
  }, [playingId]);

  async function backToUnity() {
    try {
      if (!(await unityBridge.show())) {
        setNotice('Unity đã đóng. Dữ liệu đã ghi được giữ trên máy và sẽ được đồng bộ.');
        if (playingId)
          router.replace({
            pathname: '/training/session/[sessionId]',
            params: { sessionId: playingId, trainingId, qr, mode: mode ?? '' },
          });
      }
    } catch (issue) {
      setError(describe(issue, 'Không mở lại được Unity.'));
    }
  }

  const canStartNew = building?.canStartNewSessions !== false;
  const progress = phase.name === 'downloading' ? phase.progress : null;
  const percent =
    progress && progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.bytesDone / progress.totalBytes) * 100))
      : 0;
  const title = training?.name ?? 'Chuẩn bị tập huấn';
  const back = () => router.back();

  if (seatsFull)
    return (
      <StateScreen
        header={title}
        onBack={back}
        icon={User}
        tone="warning"
        ribbon="Hết suất học viên"
        title="Tòa nhà đã hết suất"
        body="Tòa nhà đã dùng hết số học viên khác nhau trong kỳ dịch vụ. Bạn chưa thể bắt đầu phiên mới. Hãy liên hệ tổ chức."
        actions={
          <>
            <Button title="Về tòa nhà" variant="secondary" size="sm" onPress={back} />
            <Button title="Trang chủ" variant="ghost" onPress={() => router.replace('/(tabs)')} />
          </>
        }
      />
    );

  if (phase.name === 'playing' && !launched)
    return (
      <View style={styles.opening}>
        <ProgressRing value={0.35} size={160} stroke={20} />
        <Text style={styles.openingTitle}>Đang mở màn chơi…</Text>
        <Text muted style={{ fontSize: 13 }}>
          {[training?.name, building?.buildingName].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.hint}>
          <Info size={16} color={colors.muted} strokeWidth={2} />
          <Text variant="small" muted>
            Nhấn Back để hủy khi đang tải
          </Text>
        </View>
        {!!error && <Notice error>{error}</Notice>}
      </View>
    );

  const footer =
    phase.name === 'pick' && training ? (
      <Button
        title="Chuẩn bị phiên"
        icon={ArrowUpRight}
        loading={busy}
        disabled={!mode || !canStartNew}
        onPress={() => void prepare()}
      />
    ) : phase.name === 'prepared' && unityBridge.available ? (
      <Button
        title="Tải gói nhiệm vụ"
        icon={ArrowUpRight}
        onPress={() => void download(phase.session)}
      />
    ) : phase.name === 'downloading' ? (
      <Button title="Hủy tải" variant="secondary" onPress={() => abort.current?.abort()} />
    ) : phase.name === 'ready' ? (
      <Button
        title="Bắt đầu phiên"
        icon={Play}
        loading={busy}
        disabled={!canStartNew}
        onPress={() => void start(phase.session, phase.manifestPath)}
      />
    ) : undefined;

  return (
    <Screen footer={footer} contentStyle={{ padding: 16, gap: 14 }}>
      <PageHeader
        title={title}
        subtitle={
          phase.name === 'playing'
            ? 'Phiên đang chạy'
            : phase.name === 'pick'
              ? 'Bước 1/3 · Chọn chế độ'
              : modeName(phase.session.mode)
        }
        onBack={back}
      />
      {loading && <ActivityIndicator color={colors.ember} />}
      {phase.name !== 'playing' && training && (
        <PrepareSteps step={phase.name === 'pick' ? 1 : phase.name === 'ready' ? 3 : 2} />
      )}
      {offline && phase.name === 'ready' && (
        <Callout tone="warning">
          Không có mạng. Gói đã sẵn sàng; hãy kết nối để bắt đầu phiên.
        </Callout>
      )}
      {!!error && <Notice error>{error}</Notice>}
      {!!notice && <Notice>{notice}</Notice>}
      {building && !canStartNew && (
        <Callout tone="warning">
          Tòa nhà chưa có dịch vụ đang hoạt động hoặc bạn chưa có quyền; không thể bắt đầu phiên
          mới.
        </Callout>
      )}

      {training && phase.name === 'pick' && (
        <>
          <Text variant="caps" style={{ letterSpacing: 1.5 }}>
            CHỌN CÁCH CHƠI
          </Text>
          <View style={{ gap: 14 }} accessibilityRole="radiogroup">
            {modes.length === 0 && <Text muted>Bài tập chưa mở chế độ nào.</Text>}
            {modes.map((item) => (
              <ModeCard
                key={item}
                mode={item}
                selected={item === mode}
                disabled={busy}
                onPress={() => setMode(item)}
              />
            ))}
          </View>
          <Callout tone="info">Chuẩn bị và tải gói chưa tính suất học viên.</Callout>
          {!!notice && !!attempt.current?.sessionId && (
            <Button
              title="Xem phiên trước"
              variant="secondary"
              size="sm"
              onPress={() =>
                router.push({
                  pathname: '/training/session/[sessionId]',
                  params: {
                    sessionId: attempt.current!.sessionId!,
                    trainingId,
                    qr,
                    mode: mode ?? '',
                  },
                })
              }
            />
          )}
        </>
      )}

      {(phase.name === 'prepared' || phase.name === 'downloading') && (
        <>
          <View style={styles.center}>
            <ProgressRing value={percent / 100}>
              <Text style={styles.percent}>{percent}%</Text>
              <Text variant="small" muted>
                {phase.name === 'downloading' ? 'đang tải' : 'chưa tải'}
              </Text>
            </ProgressRing>
            <Text style={styles.stageTitle}>
              {phase.name === 'downloading' ? 'Đang tải gói nhiệm vụ' : 'Sẵn sàng tải gói nhiệm vụ'}
            </Text>
            {progress && (
              <Text muted style={{ fontSize: 13 }}>
                {formatBytes(progress.bytesDone)} / {formatBytes(progress.totalBytes)} · tệp{' '}
                {progress.fileIndex}/{progress.fileCount}
              </Text>
            )}
          </View>
          <Card contentStyle={{ gap: 12 }}>
            <StepRow
              label="Kiểm tra phần đã tải"
              state={!progress ? 'pending' : progress.phase === 'checking' ? 'active' : 'done'}
            />
            <StepRow
              label="Tải các tệp còn lại"
              state={
                !progress || progress.phase === 'checking'
                  ? 'pending'
                  : progress.phase === 'downloading'
                    ? 'active'
                    : 'done'
              }
            />
            <StepRow
              label="Xác minh toàn vẹn (SHA-256)"
              state={
                progress?.phase === 'verifying'
                  ? 'active'
                  : progress?.phase === 'ready'
                    ? 'done'
                    : 'pending'
              }
            />
          </Card>
          {phase.name === 'prepared' && !unityBridge.available ? (
            <Notice error>{UNITY_UNAVAILABLE_MESSAGE}</Notice>
          ) : (
            <Text variant="small" dim style={{ textAlign: 'center', lineHeight: 18 }}>
              Nên dùng Wi-Fi. Nếu bị gián đoạn, phần đã tải và đã kiểm tra được giữ lại để tải tiếp.
            </Text>
          )}
        </>
      )}

      {phase.name === 'ready' && (
        <>
          <View style={styles.center}>
            <HexBadge icon={Check} tone="exit" size={120} />
            <Ribbon label="Gói sẵn sàng" color={colors.exit} shadow="#1F6B44" />
            <Text muted style={{ fontSize: 13 }}>
              Đã tải và kiểm tra toàn vẹn
            </Text>
          </View>
          <Card contentStyle={{ gap: 10 }}>
            <SummaryRows
              rows={[
                ['Nhiệm vụ', training?.name],
                ['Chế độ', modeName(phase.session.mode)],
                ['Tòa nhà', building?.buildingName],
                ['Dung lượng', packageBytes ? formatBytes(packageBytes) : null],
              ]}
            />
          </Card>
          <Callout tone="info">
            Bắt đầu phiên cần mạng. Sau khi bắt đầu, mất mạng vẫn chơi tiếp và kết quả lưu trên máy.
          </Callout>
        </>
      )}

      {phase.name === 'playing' && (
        <Card accent contentStyle={styles.playing}>
          <HexBadge icon={Play} size={96} />
          <Ribbon label="Đang chơi trong Unity" />
          <Text style={styles.playingTitle}>Phiên của bạn đang mở</Text>
          <Text muted style={{ fontSize: 13, lineHeight: 20, textAlign: 'center' }}>
            Mất mạng vẫn chơi tiếp được. Sự kiện lưu trên máy và tự đồng bộ khi có mạng.
          </Text>
          <Button
            title="Tiếp tục chơi"
            icon={Play}
            style={{ alignSelf: 'stretch' }}
            onPress={() => void backToUnity()}
          />
        </Card>
      )}
      {phase.name === 'prepared' && !!error && unityBridge.available && (
        <Button
          title="Thử tải lại"
          icon={RefreshCw}
          variant="secondary"
          size="sm"
          onPress={() => void download(phase.session)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 12, paddingVertical: 6 },
  percent: { fontFamily: fonts.black, fontSize: 40, lineHeight: 50 },
  stageTitle: { fontFamily: fonts.black, fontSize: 19, lineHeight: 25, textAlign: 'center' },
  opening: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 24,
    backgroundColor: colors.bg,
  },
  openingTitle: { fontFamily: fonts.black, fontSize: 22, lineHeight: 29 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  playing: { alignItems: 'center', gap: 12, padding: 20, backgroundColor: colors.surfaceRaised },
  playingTitle: { fontFamily: fonts.black, fontSize: 21, lineHeight: 28, textAlign: 'center' },
});
