import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { Bookmark, Building2, CircleAlert, Play, Search, Sparkle } from 'lucide-react-native';
import { listLearnPosts, type LearnSummary } from '@/api/learn';
import { Button, IconButton } from '@/components/ui/Button';
import {
  Card,
  Cover,
  FilterChips,
  Ribbon,
  SearchField,
  type LucideIcon,
} from '@/components/ui/Game';
import { Notice, PageHeader, Screen, ScreenTitle } from '@/components/ui/Screen';
import { AiFab } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { colors, fonts, type HexTone } from '@/theme/tokens';
import { useSession } from '@/store/SessionProvider';

type Kind = LearnSummary['kind'];
export const KIND: Record<Kind, { label: string; icon: LucideIcon; tone: HexTone }> = {
  Article: { label: 'Bài viết', icon: Building2, tone: 'warning' },
  Tip: { label: 'Mẹo', icon: CircleAlert, tone: 'danger' },
  Video: { label: 'Video', icon: Play, tone: 'info' },
};
const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'Article', label: 'Bài viết' },
  { value: 'Tip', label: 'Mẹo' },
  { value: 'Video', label: 'Video' },
] as const;

function open(post: LearnSummary) {
  router.push(`/learn/${encodeURIComponent(post.slug)}`);
}

export default function LearnScreen({ standalone = false }: { standalone?: boolean }) {
  const { account } = useSession();
  const [posts, setPosts] = useState<LearnSummary[]>([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<(typeof FILTERS)[number]['value']>('all');
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

  const search = query.trim();
  const shown = kind === 'all' ? posts : posts.filter((post) => post.kind === kind);
  const [featured, ...rest] = shown;
  const bookmarks = account && (
    <IconButton
      icon={Bookmark}
      label="Bài đã lưu"
      onPress={() => router.push('/learn/bookmarks')}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen contentStyle={styles.content}>
        {standalone ? (
          <PageHeader title="Learn" onBack={() => router.back()}>
            {bookmarks}
          </PageHeader>
        ) : (
          <ScreenTitle right={bookmarks}>Learn</ScreenTitle>
        )}
        <SearchField
          accessibilityLabel="Tìm bài Learn"
          icon={Search}
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm bài, mẹo, video…"
          returnKeyType="search"
          onSubmitEditing={() => {
            if (!search || search.length >= 2) void load(1, search);
          }}
        />
        <FilterChips options={FILTERS} value={kind} onChange={setKind} />
        {!!error && <Notice error>{error}</Notice>}
        {busy && posts.length === 0 && <ActivityIndicator color={colors.ember} />}
        {!busy && shown.length === 0 && (
          <Text muted style={{ textAlign: 'center' }}>
            {search ? `Không tìm thấy bài nào cho “${search}”.` : 'Chưa có bài Learn phù hợp.'}
          </Text>
        )}
        {featured && (
          <Card
            radius={22}
            padding={0}
            onPress={() => open(featured)}
            accessibilityLabel={featured.title}
          >
            {featured.coverImageUrl ? (
              <Image source={{ uri: featured.coverImageUrl }} style={styles.featuredCover} />
            ) : (
              <Cover icon={Sparkle} tone="ember" height={150} badge={82} />
            )}
            <View style={styles.featuredBody}>
              <Ribbon label="Nổi bật" />
              <Text style={styles.featuredTitle}>{featured.title}</Text>
              <Text variant="small" muted numberOfLines={2} style={{ lineHeight: 18 }}>
                {featured.summary}
              </Text>
            </View>
          </Card>
        )}
        {rest.map((post) => {
          const meta = KIND[post.kind] ?? KIND.Article;
          return (
            <Card
              key={post.id}
              padding={10}
              onPress={() => open(post)}
              accessibilityLabel={post.title}
              contentStyle={styles.row}
            >
              {post.coverImageUrl ? (
                <Image source={{ uri: post.coverImageUrl }} style={styles.thumb} />
              ) : (
                <Cover
                  icon={meta.icon}
                  tone={meta.tone}
                  height={84}
                  width={84}
                  style={styles.thumbCover}
                />
              )}
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.kind}>{meta.label.toUpperCase()}</Text>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {post.title}
                </Text>
                <Text variant="small" dim numberOfLines={1}>
                  {post.summary}
                </Text>
              </View>
            </Card>
          );
        })}
        {posts.length < total && (
          <Button
            title="Xem thêm"
            variant="secondary"
            size="sm"
            loading={busy}
            onPress={() => void load(page + 1, search)}
          />
        )}
      </Screen>
      {!standalone && <AiFab />}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 80 },
  featuredCover: { height: 150, width: '100%', backgroundColor: colors.surfaceRaised },
  featuredBody: { padding: 14, gap: 6 },
  featuredTitle: { fontFamily: fonts.black, fontSize: 18, lineHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 84, height: 84, borderRadius: 14, backgroundColor: colors.surfaceRaised },
  thumbCover: { borderRadius: 14 },
  kind: {
    fontFamily: fonts.black,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
    color: colors.ember,
  },
  rowTitle: { fontFamily: fonts.extrabold, fontSize: 14, lineHeight: 19 },
});
