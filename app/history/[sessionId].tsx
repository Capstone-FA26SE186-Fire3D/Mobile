import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getTrainingResult, type TrainingResult } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
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

  return (
    <Screen>
      <PageHeader title="Kết quả cá nhân" onBack={() => router.back()} />
      {busy && <ActivityIndicator color={colors.primary} />}
      {!!error && <Notice error>{error}</Notice>}
      {result && (
        <View style={styles.card}>
          <Text variant="title">{result.outcome}</Text>
          <Text>Chế độ: {result.mode}</Text>
          <Text>Lý do: {result.reason}</Text>
          {result.scorePercent !== null && (
            <Text>
              Điểm từ BE: {result.scorePercent}%
              {result.passThresholdPercent !== null
                ? ` / ngưỡng ${result.passThresholdPercent}%`
                : ''}
            </Text>
          )}
          {result.criteria?.map((item) => (
            <Text key={item.id}>
              {item.passed ? '✓' : '✗'} {item.label ?? item.metric}
              {item.reason ? ` (${item.reason})` : ''}
            </Text>
          ))}
          <Button
            title="Hỏi AI về kết quả"
            onPress={() =>
              router.push({ pathname: '/ai', params: { sessionId: result.sessionId } })
            }
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16, backgroundColor: colors.surface, borderRadius: 16 },
});
