import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  cachedPlaytestPackage,
  cancelPlaytest,
  getPlaytest,
  launchPlaytest,
  preparePlaytestPackage,
  type PlaytestStatus,
  type PreparedPlaytest,
} from '@/api/playtest';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  describePlaytestProblem,
  playtestStep,
  selectPlaytestModes,
} from '@/features/playtest/playtest-flow';
import { readRecentPlaytest } from '@/features/playtest/recent-playtest';
import { getLaunch } from '@/features/training/event-queue.native';
import {
  PackageDownloadCancelled,
  type PackageProgress,
} from '@/features/training/package-cache.native';
import { formatBytes, MODE_LABELS, type TrainingMode } from '@/features/training/session-contract';
import {
  pumpTrainingRuntime,
  subscribeTrainingRuntime,
} from '@/features/training/training-runtime';
import { UNITY_UNAVAILABLE_MESSAGE, unityBridge } from '@/features/training/unity-bridge.native';
import { useSession } from '@/store/SessionProvider';
import { colors } from '@/theme/tokens';

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
      else setError(describePlaytestProblem(issue, 'Không tải được package playtest.'));
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
      setError(describePlaytestProblem(issue, 'Không mở được playtest.'));
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

  return (
    <Screen>
      <PageHeader title="Playtest tổ chức" />
      <Text muted>
        Chỉ playtest đã được bàn giao từ Web bằng cùng tài khoản OrganizationUser xuất hiện ở đây.
      </Text>
      {!status && !!playtestId && !error && <ActivityIndicator color={colors.primary} />}
      {!!error && <Notice error>{error}</Notice>}
      {!!notice && <Notice>{notice}</Notice>}
      {!playtestId && (
        <Notice>Chưa có handoff playtest trên thiết bị này. Mở link từ Web để nhận.</Notice>
      )}
      {status && step && (
        <View style={styles.section}>
          <Text variant="heading">Trạng thái: {STATUS_LABELS[status.status] ?? status.status}</Text>
          <Text variant="small" muted>
            Package {status.package.manifestHash.slice(0, 12)}…
          </Text>
          {!!recoveryCode && step.name !== 'final' && (
            <Notice error>
              {RECOVERY_LABELS[recoveryCode] ?? `Đồng bộ dừng (${recoveryCode}).`}
            </Notice>
          )}
          {!unityBridge.available && step.name !== 'final' && (
            <Notice error>{UNITY_UNAVAILABLE_MESSAGE}</Notice>
          )}

          {step.name === 'not-launch-session' && (
            <Notice error>
              Phiên đăng nhập này không phải phiên đã nhận playtest. Tạo mã bàn giao mới trên Web
              cho thiết bị này.
            </Notice>
          )}

          {step.name === 'prepare' && !download && (
            <>
              <Text variant="small" muted>
                Tải và kiểm tra SHA-256 package trước. Bước này không dùng lượt Trial.
              </Text>
              <Button
                title="Tải và kiểm tra package"
                icon="cloud-download-outline"
                disabled={busy || !unityBridge.available}
                onPress={() => void prepare()}
              />
            </>
          )}

          {download && (
            <View style={styles.card} accessibilityLabel={`Đã tải ${percent}%`}>
              <Text variant="label">
                {progress?.phase === 'verifying'
                  ? 'Đang kiểm tra SHA-256…'
                  : progress?.phase === 'checking'
                    ? 'Đang kiểm tra phần đã tải…'
                    : progress
                      ? `Đang tải ${progress.fileIndex}/${progress.fileCount} tệp`
                      : 'Đang lấy danh sách tệp…'}{' '}
                {percent}%
              </Text>
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${percent}%` }]} />
              </View>
              {progress && (
                <Text variant="small" muted>
                  {formatBytes(progress.bytesDone)} / {formatBytes(progress.totalBytes)}
                </Text>
              )}
              <Button title="Hủy tải" variant="secondary" onPress={() => abort.current?.abort()} />
            </View>
          )}

          {canLaunch && choice && (
            <View style={styles.section} accessibilityRole="radiogroup">
              <Text variant="heading">Chọn chế độ</Text>
              {choice.modes.length === 0 && (
                <Notice error>Kịch bản không cho phép chế độ nào mà runtime hỗ trợ.</Notice>
              )}
              {choice.modes.map((item) => {
                const selected = item === mode;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="radio"
                    accessibilityLabel={MODE_LABELS[item].title}
                    accessibilityState={{ checked: selected, disabled: busy }}
                    disabled={busy}
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
              <Text variant="small" muted>
                {step.name === 'start'
                  ? 'Package đã được kiểm tra. Bắt đầu sẽ dùng một lượt Trial (hoặc gói trả phí) của Building.'
                  : 'Playtest đã bắt đầu nhưng Unity chưa mở được. Thử mở lại xin grant mới, không dùng thêm lượt Trial.'}
              </Text>
              <Button
                title={step.name === 'start' ? 'Bắt đầu playtest' : 'Thử mở lại'}
                icon="play"
                loading={busy}
                disabled={busy || !mode}
                onPress={() => void launch()}
              />
            </View>
          )}

          {step.name === 'wait-launch' && (
            <Notice>Đang chờ máy chủ xác nhận Unity đã mở. Cập nhật trạng thái sau ít phút.</Notice>
          )}

          {step.name === 'back-to-unity' && (
            <Button
              title="Quay lại Unity"
              icon="game-controller-outline"
              onPress={() => void backToUnity()}
            />
          )}

          {step.name === 'running-elsewhere' && (
            <Notice>
              Unity không còn chạy playtest này trên máy. Sự kiện đã ghi sẽ được đồng bộ; playtest
              không được tự chạy lại.
            </Notice>
          )}

          {step.name === 'final' && (
            <Notice>
              {step.state === 'Completed'
                ? `Playtest đã hoàn tất${status.completion ? ` với ${status.completion.lastEventSequence} sự kiện` : ''}.`
                : 'Playtest đã bị hủy.'}{' '}
              Muốn chơi lại, tạo playtest mới trên Web.
            </Notice>
          )}

          {status.recovery.canCancel && step.name !== 'final' && (
            <Button
              title="Hủy playtest"
              disabled={busy || !!download}
              variant="secondary"
              onPress={() => void cancel()}
            />
          )}
          <Button
            title="Cập nhật trạng thái"
            variant="secondary"
            disabled={busy}
            onPress={() => void refresh()}
          />
        </View>
      )}
      <Button title="Đăng xuất" variant="ghost" onPress={() => void signOut()} />
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
