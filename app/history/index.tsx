import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getTrainingHistory, type TrainingHistoryItem } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/tokens';

export default function HistoryScreen() {
  const [items, setItems] = useState<TrainingHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(nextPage: number) {
    setBusy(true);
    setError('');
    try {
      const result = await getTrainingHistory(nextPage);
      setItems((current) => (nextPage === 1 ? result.items : [...current, ...result.items]));
      setPage(nextPage);
      setTotal(result.totalCount);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không tải được lịch sử phiên.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  return (
    <Screen>
      <PageHeader title="Lịch sử tập huấn" onBack={() => router.back()} />
      {!!error && <Notice error>{error}</Notice>}
      {busy && <ActivityIndicator color={colors.primary} />}
      {!busy && items.length === 0 && <Text muted>Chưa có phiên tập huấn nào.</Text>}
      {items.map((item) => (
        <View key={item.sessionId} style={styles.card}>
          <Text variant="heading">{item.training.name}</Text>
          <Text muted>
            {item.building.name} • {item.mode} • {new Date(item.startedAt).toLocaleString('vi-VN')}
          </Text>
          <Text>
            Phiên: {item.status}. Kết quả: {item.resultStatus ?? 'Chưa có'}.
          </Text>
          <Button
            title="Xem kết quả"
            variant="secondary"
            disabled={!item.resultStatus}
            onPress={() => router.push(`/history/${item.sessionId}`)}
          />
        </View>
      ))}
      {items.length < total && (
        <Button title="Xem thêm" disabled={busy} onPress={() => void load(page + 1)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 16, backgroundColor: colors.surface, borderRadius: 16 },
});
