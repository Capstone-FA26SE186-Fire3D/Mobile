import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { listLearnPosts, type LearnSummary } from '@/api/learn';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme/tokens';
import { useSession } from '@/store/SessionProvider';

export default function LearnIndex() {
  const { account } = useSession();
  const [posts, setPosts] = useState<LearnSummary[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextPage: number, search: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await listLearnPosts(nextPage, search || undefined);
      setPosts((current) => (nextPage === 1 ? result.items : [...current, ...result.items]));
      setPage(nextPage);
      setTotal(result.total);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không tải được nội dung Learn.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(1, '');
  }, [load]);

  return (
    <Screen>
      <PageHeader title="Learn" onBack={() => router.back()} />
      <Text muted>Nội dung học công khai về an toàn và ứng phó sự cố.</Text>
      {account && (
        <Button
          title="Bài đã lưu"
          variant="secondary"
          onPress={() => router.push('/learn/bookmarks')}
        />
      )}
      <View style={styles.search}>
        <TextInput
          accessibilityLabel="Tìm bài Learn"
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm theo tiêu đề hoặc tóm tắt"
          style={styles.input}
        />
        <Button
          title="Tìm"
          disabled={busy || (!!query.trim() && query.trim().length < 2)}
          onPress={() => void load(1, query.trim())}
        />
      </View>
      {!!error && <Notice error>{error}</Notice>}
      {busy && <ActivityIndicator color={colors.primary} />}
      {!busy && posts.length === 0 && <Text muted>Chưa có bài Learn phù hợp.</Text>}
      {posts.map((post) => (
        <View key={post.id} style={styles.card}>
          <Text variant="heading">{post.title}</Text>
          <Text muted>{post.summary}</Text>
          <Text variant="small">{post.kind}</Text>
          <Button
            title="Đọc bài"
            variant="secondary"
            onPress={() => router.push(`/learn/${encodeURIComponent(post.slug)}`)}
          />
        </View>
      ))}
      {posts.length < total && (
        <Button
          title="Xem thêm"
          disabled={busy}
          onPress={() => void load(page + 1, query.trim())}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { gap: 10 },
  input: {
    minHeight: 54,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  card: { gap: 9, backgroundColor: colors.surface, borderRadius: 16, padding: 16 },
});
