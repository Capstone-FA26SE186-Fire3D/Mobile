import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { listBookmarks, type Bookmark } from '@/api/learn';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/tokens';

export default function BookmarksScreen() {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(nextPage: number) {
    setBusy(true);
    setError('');
    try {
      const response = await listBookmarks(nextPage);
      setItems((current) => (nextPage === 1 ? response.items : [...current, ...response.items]));
      setPage(nextPage);
      setTotal(response.total);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không tải được bookmark.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load(1);
  }, []);
  return (
    <Screen>
      <PageHeader title="Bài đã lưu" onBack={() => router.back()} />
      {!!error && <Notice error>{error}</Notice>}
      {busy && <ActivityIndicator color={colors.primary} />}
      {!busy && items.length === 0 && <Text muted>Chưa lưu bài Learn nào.</Text>}
      {items.map((item) => (
        <View key={item.postId} style={styles.card}>
          {item.available && item.slug ? (
            <>
              <Text variant="heading">{item.title}</Text>
              {!!item.summary && <Text muted>{item.summary}</Text>}
              <Button
                title="Đọc bài"
                variant="secondary"
                onPress={() => router.push(`/learn/${encodeURIComponent(item.slug!)}`)}
              />
            </>
          ) : (
            <Notice>Bài này hiện không còn công khai.</Notice>
          )}
        </View>
      ))}
      {items.length < total && (
        <Button title="Xem thêm" disabled={busy} onPress={() => void load(page + 1)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 9, padding: 16, backgroundColor: colors.surface, borderRadius: 16 },
});
