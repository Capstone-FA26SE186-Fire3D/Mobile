import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { getTrainingResult, type TrainingResult } from '@/api/training-history';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { TrainingResultView } from '@/features/training/components/TrainingResultCard';
import { colors } from '@/theme/tokens';

export default function ResultScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    if (typeof sessionId !== 'string') return;
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

  // Replaying needs the Building QR (access is re-checked there), so history results only close.
  if (result) return <TrainingResultView result={result} onClose={() => router.back()} />;
  return (
    <Screen>
      <PageHeader title="Kết quả phiên" onBack={() => router.back()} />
      {busy && <ActivityIndicator color={colors.ember} />}
      {!!error && <Notice error>{error}</Notice>}
    </Screen>
  );
}
