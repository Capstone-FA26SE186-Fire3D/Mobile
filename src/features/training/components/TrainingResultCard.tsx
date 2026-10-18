import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { TrainingResult } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/tokens';
import { MODE_LABELS, type TrainingMode } from '../session-contract';

const OUTCOMES: Record<string, { label: string; tone: 'good' | 'bad' | 'neutral' }> = {
  Passed: { label: 'Đạt', tone: 'good' },
  NotPassed: { label: 'Chưa đạt', tone: 'bad' },
  Incomplete: { label: 'Chưa hoàn thành', tone: 'bad' },
  NotAssessed: { label: 'Không chấm điểm', tone: 'neutral' },
};

export function modeTitle(mode: string): string {
  return MODE_LABELS[mode as TrainingMode]?.title ?? mode;
}

/** Server-computed result; Mobile never decides Passed/NotPassed. */
export function TrainingResultCard({ result }: { result: TrainingResult }) {
  const outcome = OUTCOMES[result.outcome] ?? { label: result.outcome, tone: 'neutral' as const };
  return (
    <View style={styles.card}>
      <Text variant="small" muted>
        Kết quả do Fire3D chấm
      </Text>
      <Text
        variant="title"
        style={
          outcome.tone === 'good'
            ? { color: colors.green }
            : outcome.tone === 'bad'
              ? { color: colors.red }
              : undefined
        }
      >
        {outcome.label}
      </Text>
      <Text>Chế độ: {modeTitle(result.mode)}</Text>
      {result.outcome === 'NotAssessed' && (
        <Text muted>
          Learn và Guided Drill không chấm Đạt/Chưa đạt; chọn Assessment để được chấm.
        </Text>
      )}
      <Text muted>Mã lý do: {result.reason}</Text>
      {result.scorePercent !== null && (
        <Text>
          Điểm: {result.scorePercent}%
          {result.passThresholdPercent !== null ? ` / ngưỡng ${result.passThresholdPercent}%` : ''}
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
        variant="secondary"
        onPress={() => router.push({ pathname: '/ai', params: { sessionId: result.sessionId } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16, backgroundColor: colors.surface, borderRadius: 16 },
});
