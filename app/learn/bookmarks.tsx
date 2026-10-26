import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Bookmark as BookmarkIcon, Lock, X } from 'lucide-react-native';
import { listBookmarks, setBookmark, type Bookmark } from '@/api/learn';
import { Button } from '@/components/ui/Button';
import { Card, Cover, HexBadge } from '@/components/ui/Game';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { KIND } from '@/features/learn/screens/LearnScreen';
import { colors, fonts } from '@/theme/tokens';

export default function BookmarksScreen() {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (nextPage: number) => {
    setBusy(true);
    setError('');
    try {
      const response = await listBookmarks(nextPage);
      setItems((current) =>
        nextPage === 1 ? (response.items ?? []) : [...current, ...(response.items ?? [])],
      );
      setPage(nextPage);
      setTotal(response.total);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không tải được bookmark.');
    } finally {
      setBusy(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load(1);
    }, [load]),
  );

  async function remove(item: Bookmark) {
    setError('');
    try {
      await setBookmark(item.postId, false);
      setItems((current) => current.filter((entry) => entry.postId !== item.postId));
      setTotal((count) => Math.max(0, count - 1));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không bỏ lưu được bài.');
    }
  }

  return (
    <Screen contentStyle={{ padding: 16, gap: 14 }}>
      <PageHeader title="Bài đã lưu" subtitle={`${total} bài`} onBack={() => router.back()} />
      {!!error && <Notice error>{error}</Notice>}
      {busy && items.length === 0 && <ActivityIndicator color={colors.ember} />}
      {!busy && items.length === 0 && (
        <Card contentStyle={styles.empty}>
          <HexBadge icon={BookmarkIcon} tone="warning" size={64} />
          <Text style={styles.emptyTitle}>Chưa lưu bài nào</Text>
          <Text variant="small" muted style={{ textAlign: 'center' }}>
            Bấm biểu tượng lưu trong bài Learn để đọc lại sau.
          </Text>
        </Card>
      )}
      {items.map((item) => {
        const available = item.available && !!item.slug;
        const kind = KIND[(item.kind as keyof typeof KIND) ?? 'Article'] ?? KIND.Article;
        return (
          <Card
            key={item.postId}
            padding={10}
            contentStyle={styles.row}
            style={!available && { opacity: 0.6 }}
            accessibilityLabel={item.title ?? 'Bài đã bị gỡ'}
            onPress={
              available ? () => router.push(`/learn/${encodeURIComponent(item.slug!)}`) : undefined
            }
          >
            <Cover
              icon={available ? kind.icon : Lock}
              tone={available ? kind.tone : 'neutral'}
              height={72}
              width={72}
              badge={40}
              style={{ borderRadius: 14 }}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.kind, !available && { color: colors.dim }]}>
                {available ? kind.label.toUpperCase() : 'KHÔNG CÒN CÔNG KHAI'}
              </Text>
              <Text style={styles.title} numberOfLines={2}>
                {available ? item.title : 'Bài đã bị gỡ'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bỏ lưu"
              hitSlop={10}
              onPress={() => void remove(item)}
            >
              {available ? (
                <BookmarkIcon size={20} color={colors.ember} fill={colors.ember} strokeWidth={2} />
              ) : (
                <X size={20} color={colors.dim} strokeWidth={2.25} />
              )}
            </Pressable>
          </Card>
        );
      })}
      {items.length < total && (
        <Button
          title="Xem thêm"
          variant="secondary"
          size="sm"
          loading={busy}
          onPress={() => void load(page + 1)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kind: {
    fontFamily: fonts.black,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
    color: colors.ember,
  },
  title: { fontFamily: fonts.extrabold, fontSize: 14, lineHeight: 19 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyTitle: { fontFamily: fonts.black, fontSize: 18, lineHeight: 24 },
});
