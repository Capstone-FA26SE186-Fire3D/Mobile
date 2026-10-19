import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ApiError } from '@/api';
import {
  getQrTrainings,
  resolveBuildingQr,
  type BuildingQrResolution,
  type Training,
} from '@/api/qr';
import {
  downloadTrainingPackage,
  getTrainingSession,
  launchStartedSession,
  prepareTrainingSession,
  startTrainingSession,
  type TrainingSession,
} from '@/api/training';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
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
  type PackageProgress,
} from '@/features/training/package-cache.native';
import {
  MODE_LABELS,
  allowedTrainingModes,
  describeTrainingProblem,
  formatBytes,
  pinFromSession,
  type TrainingMode,
} from '@/features/training/session-contract';
import { isOfflineError, subscribeTrainingRuntime } from '@/features/training/training-runtime';
import { UNITY_UNAVAILABLE_MESSAGE, unityBridge } from '@/features/training/unity-bridge.native';
import { useSession } from '@/store/SessionProvider';
import { colors } from '@/theme/tokens';

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
    const controller = new AbortController();
    abort.current = controller;
    setError('');
    setPhase({ name: 'downloading', session, progress: null });
    try {
      const manifestPath = await downloadTrainingPackage(session, {
        signal: controller.signal,
        onProgress: (progress) => setPhase({ name: 'downloading', session, progress }),
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
    try {
      const started = await startTrainingSession(session, attempt.current.startKey, async () => {
        attempt.current = await rotateStartKey(account.id, attempt.current!);
        return attempt.current.startKey!;
      });
      setPhase({ name: 'playing', session: started.session, manifestPath });
      await launchStartedSession(started, manifestPath, 0, account.id);
    } catch (issue) {
      setPhase({ name: 'ready', session, manifestPath });
      setError(describe(issue, 'Không bắt đầu được phiên.'));
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
      if (message.type === 'Launched') launched = true;
      else if (message.type === 'Completed') openResult();
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

  return (
    <Screen>
      <PageHeader title="Chuẩn bị tập huấn" onBack={() => router.back()} />
      {loading && <ActivityIndicator color={colors.primary} />}
      {training && (
        <View style={styles.section}>
          <Text variant="title">{training.name}</Text>
          {!!training.description && <Text muted>{training.description}</Text>}
          {building && <Text muted>{building.buildingName}</Text>}
        </View>
      )}
      {!!error && <Notice error>{error}</Notice>}
      {!!notice && <Notice>{notice}</Notice>}
      {building && !canStartNew && (
        <Notice error>
          Building chưa có dịch vụ đang hoạt động hoặc bạn chưa có quyền; không thể bắt đầu phiên
          mới.
        </Notice>
      )}
      {training && (
        <View style={styles.section} accessibilityRole="radiogroup">
          <Text variant="heading">Chọn chế độ</Text>
          {modes.length === 0 && <Text muted>Bài tập chưa mở chế độ nào.</Text>}
          {modes.map((item) => {
            const selected = item === mode;
            const locked = phase.name !== 'pick' && phase.name !== 'prepared';
            return (
              <Pressable
                key={item}
                accessibilityRole="radio"
                accessibilityLabel={MODE_LABELS[item].title}
                accessibilityState={{ checked: selected, disabled: locked }}
                disabled={locked || busy}
                onPress={() => setMode(item)}
                style={[styles.mode, selected && styles.modeSelected]}
              >
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={selected ? colors.primary : colors.muted}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="label">{MODE_LABELS[item].title}</Text>
                  <Text variant="small" muted>
                    {MODE_LABELS[item].description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {training && phase.name === 'pick' && (
        <Button
          title="Chuẩn bị phiên"
          icon="clipboard-outline"
          loading={busy}
          disabled={!mode || !canStartNew}
          onPress={() => void prepare()}
        />
      )}

      {phase.name !== 'pick' && (
        <View style={styles.card}>
          <Text variant="label">Phiên đã chuẩn bị</Text>
          <Text variant="small" muted>
            Chế độ {MODE_LABELS[phase.session.mode as TrainingMode]?.title ?? phase.session.mode}
            {phase.session.expiresAt
              ? ` • hết hạn ${new Date(phase.session.expiresAt).toLocaleString('vi-VN')}`
              : ''}
          </Text>
          <Text variant="small" muted>
            Chuẩn bị và tải gói chưa tính suất học viên. Suất chỉ được tính khi bạn bắt đầu phiên.
          </Text>
        </View>
      )}

      {phase.name === 'prepared' &&
        (unityBridge.available ? (
          <Button
            title="Tải gói tập huấn"
            icon="cloud-download-outline"
            onPress={() => void download(phase.session)}
          />
        ) : (
          <Notice error>{UNITY_UNAVAILABLE_MESSAGE}</Notice>
        ))}

      {phase.name === 'downloading' && (
        <View style={styles.card} accessibilityLabel={`Đã tải ${percent}%`}>
          <Text variant="label">
            {progress?.phase === 'verifying'
              ? 'Đang kiểm tra SHA-256…'
              : progress?.phase === 'checking'
                ? 'Đang kiểm tra phần đã tải…'
                : 'Đang tải gói…'}{' '}
            {percent}%
          </Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${percent}%` }]} />
          </View>
          {progress && (
            <Text variant="small" muted>
              {formatBytes(progress.bytesDone)} / {formatBytes(progress.totalBytes)} • file{' '}
              {progress.fileIndex}/{progress.fileCount}
            </Text>
          )}
          <Button title="Hủy tải" variant="secondary" onPress={() => abort.current?.abort()} />
        </View>
      )}

      {phase.name === 'ready' && (
        <>
          <Notice>Gói đã được tải và kiểm tra SHA-256. Bắt đầu phiên cần kết nối mạng.</Notice>
          <Button
            title="Bắt đầu phiên"
            icon="play-outline"
            loading={busy}
            disabled={!canStartNew}
            onPress={() => void start(phase.session, phase.manifestPath)}
          />
        </>
      )}

      {phase.name === 'playing' && (
        <View style={styles.card}>
          <Text variant="label">Đang chơi trong Unity</Text>
          <Text variant="small" muted>
            Mất mạng vẫn chơi tiếp được; sự kiện được lưu trên máy và tự đồng bộ khi có mạng.
          </Text>
          <Button
            title="Tiếp tục chơi"
            icon="game-controller-outline"
            onPress={() => void backToUnity()}
          />
        </View>
      )}

      {!!notice && !!attempt.current?.sessionId && phase.name === 'pick' && (
        <Button
          title="Xem phiên trước"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/training/session/[sessionId]',
              params: { sessionId: attempt.current!.sessionId!, trainingId, qr, mode: mode ?? '' },
            })
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  card: { gap: 10, padding: 16, borderRadius: 16, backgroundColor: colors.surface },
  mode: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modeSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.sand, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
