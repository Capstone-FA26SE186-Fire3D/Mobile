import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { ApiError } from '@/api';
import { getTrainingSession } from '@/api/training';
import { getTrainingResult, type TrainingResult } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { clearAttempt } from '@/features/training/attempt-store';
import { TrainingResultCard } from '@/features/training/components/TrainingResultCard';
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
import { colors } from '@/theme/tokens';

type View_ =
  | { stage: 'loading' }
  | { stage: 'completed'; result: TrainingResult }
  | { stage: 'awaiting'; detail: string }
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
          setView({ stage: 'awaiting', detail: describeSyncError(issue) });
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

  const retrain = () =>
    trainingId && qr
      ? router.replace({
          pathname: '/training/[trainingId]',
          params: { trainingId, qr, mode: mode ?? '' },
        })
      : router.replace('/(tabs)');

  return (
    <Screen>
      <PageHeader title="Kết quả phiên" onBack={() => router.replace('/(tabs)')} />
      {view.stage === 'loading' && (
        <View style={{ gap: 12, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
          <Text muted>Đang đồng bộ kết quả…</Text>
        </View>
      )}
      {view.stage === 'completed' && <TrainingResultCard result={view.result} />}
      {view.stage === 'awaiting' && (
        <View style={{ gap: 12 }}>
          <Text variant="title">Đang chờ đồng bộ</Text>
          <Notice>{view.detail}</Notice>
          <Text muted>{SYNC_WAIT}</Text>
        </View>
      )}
      {view.stage === 'running' && (
        <View style={{ gap: 12 }}>
          <Text variant="heading">Phiên chưa kết thúc</Text>
          <Text muted>
            Unity chưa gửi hoàn tất cho phiên này. Nếu Unity còn mở, bạn có thể chơi tiếp.
          </Text>
          {unityBridge.available && (
            <Button
              title="Tiếp tục chơi"
              icon="game-controller-outline"
              onPress={() => void unityBridge.show().catch(() => false)}
            />
          )}
        </View>
      )}
      {view.stage === 'error' && <Notice error>{view.message}</Notice>}
      {view.stage !== 'completed' && view.stage !== 'loading' && (
        <Button
          title="Đồng bộ lại"
          icon="sync-outline"
          variant="secondary"
          loading={busy}
          onPress={() => void load()}
        />
      )}
      {view.stage === 'completed' && (
        <Button title="Làm lại bài" icon="refresh-outline" onPress={retrain} />
      )}
      <Button title="Về trang chủ" variant="ghost" onPress={() => router.replace('/(tabs)')} />
    </Screen>
  );
}
