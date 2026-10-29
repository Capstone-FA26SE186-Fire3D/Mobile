import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { getTrainingResult, type TrainingResult } from '@/api/training-history';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { TrainingResultView } from '@/features/training/components/TrainingResultCard';
import { readDownload, type DownloadRecord } from '@/features/training/downloads-store';
import { useSession } from '@/store/SessionProvider';
import { colors } from '@/theme/tokens';

export default function ResultScreen() {
  const params = useLocalSearchParams<{ sessionId: string; trainingId?: string }>();
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : '';
  const trainingId = typeof params.trainingId === 'string' ? params.trainingId : '';
  const { account } = useSession();
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [saved, setSaved] = useState<DownloadRecord | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    getTrainingResult(sessionId)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((issue) => {
        if (active) setError(issue instanceof Error ? issue.message : 'Chưa có kết quả chấm.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  // Replay needs the Building QR the training was downloaded with ("Bài đã tải"); access is re-checked there.
  // Without a saved download the result screen offers scanning the QR instead.
  useEffect(() => {
    if (!account || !trainingId) return;
    let active = true;
    readDownload(account.id, trainingId)
      .then((record) => {
        if (active) setSaved(record);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [account?.id, trainingId]);

  const replay = (record: DownloadRecord, mode: string) =>
    router.push({
      pathname: '/training/[trainingId]',
      params: { trainingId: record.trainingId, qr: record.qrToken, mode },
    });

  if (result)
    return (
      <TrainingResultView
        result={result}
        onClose={() => router.back()}
        onRetry={saved ? () => replay(saved, result.mode) : undefined}
        onAssessment={saved ? () => replay(saved, 'Assessment') : undefined}
      />
    );
  return (
    <Screen>
      <PageHeader title="Kết quả phiên" onBack={() => router.back()} />
      {busy && <ActivityIndicator color={colors.ember} />}
      {!!error && <Notice error>{error}</Notice>}
    </Screen>
  );
}
