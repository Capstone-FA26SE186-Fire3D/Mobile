import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Play, RefreshCw } from 'lucide-react-native';
import { ApiError } from '@/api';
import { getTrainingSession } from '@/api/training';
import { getTrainingResult, type TrainingResult } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Card, HexBadge, Pill, ProgressRing, Ribbon } from '@/components/ui/Game';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { clearAttempt } from '@/features/training/attempt-store';
import { TrainingResultView } from '@/features/training/components/TrainingResultCard';
import { localSessionState } from '@/features/training/event-queue.native';
import { TRAINING_MODES, type TrainingMode } from '@/features/training/session-contract';
import {
  describeSyncError,
  isOfflineError,
  pumpTrainingRuntime,
  subscribeTrainingRuntime,
} from '@/features/training/training-runtime';
import { unityBridge } from '@/features/training/unity-bridge.native';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

type View_ =
  | { stage: 'loading' }
  | { stage: 'completed'; result: TrainingResult }
  | { stage: 'awaiting'; detail: string; pending: number; offline: boolean }
  | { stage: 'running' }
  | { stage: 'error'; message: string };

const SYNC_WAIT =
  'Kết quả và sự kiện của phiên vẫn được lưu trên máy. Ứng dụng tự gửi khi có mạng; Fire3D chỉ chấm khi nhận đủ dữ liệu.';

export default function TrainingSessionResultScreen() {
  const params = useLocalSearchParams<{
    sessionId: string;
    trainingId?: string;
    qr?: string;
    mode?: string;
  }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const trainingId = typeof params.trainingId === 'string' ? params.trainingId : '';
  const qr = typeof params.qr === 'string' ? params.qr : '';
  const mode = TRAINING_MODES.includes(params.mode as TrainingMode)
    ? (params.mode as TrainingMode)
    : null;
  const { account } = useSession();
  const [view, setView] = useState<View_>({ stage: 'loading' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      let local = { pendingEvents: 0, completion: null as string | null, launched: false };
      if (unityBridge.available) {
        await pumpTrainingRuntime();
        local = await localSessionState(sessionId);
      }
      const localWaiting =
        local.pendingEvents > 0 || (local.completion !== null && local.completion !== 'completed');
      let session;
      try {
        session = await getTrainingSession(sessionId);
      } catch (issue) {
        if (isOfflineError(issue) && (localWaiting || local.launched)) {
          setView({
            stage: 'awaiting',
            detail: describeSyncError(issue),
            pending: local.pendingEvents,
            offline: true,
          });
          return;
        }
        throw issue;
      }
      if (session.hasResult || session.status === 'Completed') {
        try {
          const result = await getTrainingResult(sessionId);
          setView({ stage: 'completed', result });
          if (account && trainingId && mode) await clearAttempt(account.id, trainingId, mode);
          return;
        } catch (issue) {
          if (!(issue instanceof ApiError) || issue.status !== 409) throw issue;
        }
      }
      if (session.status === 'AwaitingSync' || session.status === 'Completed' || localWaiting)
        setView({
          stage: 'awaiting',
          detail:
            local.pendingEvents > 0
              ? `Còn ${local.pendingEvents} sự kiện chưa gửi.`
              : 'Fire3D đang chờ đủ sự kiện của phiên trước khi chấm.',
          pending: local.pendingEvents,
          offline: false,
        });
      else setView({ stage: 'running' });
    } catch (issue) {
      setView({ stage: 'error', message: describeSyncError(issue) });
    } finally {
      setBusy(false);
    }
  }, [sessionId, account?.id, trainingId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      subscribeTrainingRuntime((event) => {
        if (event.kind === 'synced' && event.sessionId === sessionId) void load();
      }),
    [sessionId, load],
  );

  const retrain = (nextMode: TrainingMode | null = mode) =>
    trainingId && qr
      ? router.replace({
          pathname: '/training/[trainingId]',
          params: { trainingId, qr, mode: nextMode ?? '' },
        })
      : router.replace('/(tabs)');
  const home = () => router.replace('/(tabs)');

  if (view.stage === 'completed')
    return (
      <TrainingResultView
        result={view.result}
        onClose={home}
        onRetry={() => retrain()}
        onAssessment={() => retrain('Assessment')}
      />
    );

  return (
    <Screen
      footer={
        view.stage === 'loading' ? undefined : (
          <>
            <Button
              title="Đồng bộ lại"
              icon={RefreshCw}
              loading={busy}
              onPress={() => void load()}
            />
            <Button title="Về trang chủ" variant="secondary" size="sm" onPress={home} />
          </>
        )
      }
    >
      <PageHeader title="Kết quả phiên" onBack={home} />
      {view.stage === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ember} />
          <Text muted>Đang đồng bộ kết quả…</Text>
        </View>
      )}
      {view.stage === 'awaiting' && (
        <>
          <View style={styles.center}>
            <ProgressRing
              value={view.pending > 0 ? 0.6 : 0.85}
              size={180}
              stroke={20}
              color={colors.hex.info}
            >
              {view.pending > 0 ? (
                <>
                  <Text style={styles.count}>{view.pending}</Text>
                  <Text variant="small" muted>
                    sự kiện còn lại
                  </Text>
                </>
              ) : (
                <RefreshCw size={44} color={colors.hex.info} strokeWidth={2} />
              )}
            </ProgressRing>
            <Ribbon label="Đang chờ đồng bộ" color={colors.hex.info} shadow="#2A2F31" />
            <Text muted style={styles.body}>
              {SYNC_WAIT}
            </Text>
          </View>
          <Card contentStyle={{ gap: 12 }}>
            <View style={styles.row}>
              <Text muted style={styles.key}>
                Phiên
              </Text>
              <Pill label="Đã hoàn tất trên máy" tone="success" />
            </View>
            <View style={styles.row}>
              <Text muted style={styles.key}>
                Sự kiện
              </Text>
              <Pill
                label={view.pending > 0 ? `${view.pending} chờ gửi` : 'Đã gửi hết'}
                tone={view.pending > 0 ? 'warning' : 'success'}
              />
            </View>
            <View style={styles.row}>
              <Text muted style={styles.key}>
                Kết nối
              </Text>
              <Pill
                label={view.offline ? 'Chưa có mạng' : 'Đang chờ máy chủ chấm'}
                tone={view.offline ? 'danger' : 'info'}
              />
            </View>
          </Card>
          <Text variant="small" dim style={{ textAlign: 'center' }}>
            {view.detail}
          </Text>
        </>
      )}
      {view.stage === 'running' && (
        <Card accent contentStyle={[styles.center, { padding: 20 }]}>
          <HexBadge icon={Play} size={96} />
          <Ribbon label="Phiên chưa kết thúc" />
          <Text muted style={styles.body}>
            Unity chưa gửi hoàn tất cho phiên này. Nếu Unity còn mở, bạn có thể chơi tiếp.
          </Text>
          {unityBridge.available && (
            <Button
              title="Tiếp tục chơi"
              icon={Play}
              style={{ alignSelf: 'stretch' }}
              onPress={() => void unityBridge.show().catch(() => false)}
            />
          )}
        </Card>
      )}
      {view.stage === 'error' && <Notice error>{view.message}</Notice>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  count: { fontFamily: fonts.black, fontSize: 40, lineHeight: 50 },
  body: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  key: { flex: 1, fontSize: 13 },
});
