import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { CloudUpload, Hourglass, Play, RefreshCw, RotateCcw } from 'lucide-react-native';
import { ApiError } from '@/api';
import { getTrainingSession } from '@/api/training';
import { getTrainingResult, type TrainingResult } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Card, HexBadge, Ribbon } from '@/components/ui/Game';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { clearAttempt } from '@/features/training/attempt-store';
import { TrainingResultView } from '@/features/training/components/TrainingResultCard';
import { readDownload } from '@/features/training/downloads-store';
import { localSessionState } from '@/features/training/event-queue.native';
import { presentWaiting, type WaitingView } from '@/features/training/result-presentation';
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
  | { stage: 'awaiting'; waiting: WaitingView }
  /** `open`: Unity still holds this session, so "Tiếp tục chơi" can bring it back; otherwise the round was closed. */
  | { stage: 'running'; open: boolean }
  | { stage: 'error'; message: string };

export default function TrainingSessionResultScreen() {
  const params = useLocalSearchParams<{
    sessionId: string;
    trainingId?: string;
    qr?: string;
    mode?: string;
  }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const trainingId = typeof params.trainingId === 'string' ? params.trainingId : '';
  const qrParam = typeof params.qr === 'string' ? params.qr : '';
  const mode = TRAINING_MODES.includes(params.mode as TrainingMode)
    ? (params.mode as TrainingMode)
    : null;
  const { account } = useSession();
  const [view, setView] = useState<View_>({ stage: 'loading' });
  const [busy, setBusy] = useState(false);
  const [savedQr, setSavedQr] = useState('');
  const qr = qrParam || savedQr;

  // Opened from history without a QR: a saved download of this training still allows replay.
  useEffect(() => {
    if (qrParam || !account || !trainingId) return;
    let active = true;
    readDownload(account.id, trainingId)
      .then((record) => {
        if (active && record) setSavedQr(record.qrToken);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [qrParam, account?.id, trainingId]);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      let local = { pendingEvents: 0, completion: null as string | null, launched: false };
      if (unityBridge.available) {
        await pumpTrainingRuntime();
        local = await localSessionState(sessionId);
      }
      const completionPending = local.completion !== null && local.completion !== 'completed';
      const localWaiting = local.pendingEvents > 0 || completionPending;
      const waiting = (offline: boolean) =>
        presentWaiting({ pendingEvents: local.pendingEvents, completionPending, offline });
      let session;
      try {
        session = await getTrainingSession(sessionId);
      } catch (issue) {
        if (isOfflineError(issue) && (localWaiting || local.launched)) {
          setView({ stage: 'awaiting', waiting: waiting(true) });
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
        setView({ stage: 'awaiting', waiting: waiting(false) });
      else setView({ stage: 'running', open: await unityHolds(sessionId) });
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

  const canReplay = !!(trainingId && qr);
  // Unity can only be brought back while it still holds this exact session (not idle, not killed with the app).
  const resume = async () => {
    const shown = (await unityHolds(sessionId)) && (await unityBridge.show().catch(() => false));
    if (!shown) setView({ stage: 'running', open: false });
  };
  const retrain = (nextMode: TrainingMode | null = mode) =>
    router.replace({
      pathname: '/training/[trainingId]',
      params: { trainingId, qr, mode: nextMode ?? '' },
    });
  const home = () => router.replace('/(tabs)');

  if (view.stage === 'completed')
    return (
      <TrainingResultView
        result={view.result}
        onClose={home}
        onRetry={canReplay ? () => retrain() : undefined}
        onAssessment={canReplay ? () => retrain('Assessment') : undefined}
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
          <Text muted>Đang tải kết quả…</Text>
        </View>
      )}
      {view.stage === 'awaiting' && (
        <Card accent contentStyle={[styles.center, { padding: 20 }]}>
          <HexBadge
            icon={view.waiting.kind === 'saved-offline' ? CloudUpload : Hourglass}
            tone="info"
            size={110}
          />
          <Ribbon label={view.waiting.title} color={colors.hex.info} shadow="#2A2F31" />
          <Text muted style={styles.body}>
            {view.waiting.body}
          </Text>
        </Card>
      )}
      {view.stage === 'running' && view.open && (
        <Card accent contentStyle={[styles.center, { padding: 20 }]}>
          <HexBadge icon={Play} size={96} />
          <Ribbon label="Phiên chưa kết thúc" />
          <Text muted style={styles.body}>
            Màn chơi vẫn đang mở. Bạn có thể chơi tiếp.
          </Text>
          <Button
            title="Tiếp tục chơi"
            icon={Play}
            style={{ alignSelf: 'stretch' }}
            onPress={() => void resume()}
          />
        </Card>
      )}
      {view.stage === 'running' && !view.open && (
        <Card accent contentStyle={[styles.center, { padding: 20 }]}>
          <HexBadge icon={RotateCcw} tone="info" size={96} />
          <Ribbon label="Lượt chơi đã đóng" color={colors.hex.info} shadow="#2A2F31" />
          <Text muted style={styles.body}>
            Màn chơi của lượt này đã đóng (ứng dụng hoặc màn chơi bị tắt) nên không chơi tiếp được.
            {canReplay
              ? ' Hãy bắt đầu một lượt mới.'
              : ' Hãy quét lại mã QR của tòa nhà để bắt đầu lượt mới.'}
          </Text>
          {canReplay && (
            <Button
              title="Chơi lượt mới"
              icon={Play}
              style={{ alignSelf: 'stretch' }}
              onPress={() => retrain()}
            />
          )}
        </Card>
      )}
      {view.stage === 'error' && <Notice error>{view.message}</Notice>}
    </Screen>
  );
}

async function unityHolds(sessionId: string): Promise<boolean> {
  if (!unityBridge.available) return false;
  try {
    return (await unityBridge.activeSession()) === sessionId;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  body: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
