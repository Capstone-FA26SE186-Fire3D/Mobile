import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Check,
  Play,
  Search,
  Sparkle,
} from 'lucide-react-native';
import { ApiError } from '@/api';
import {
  getBookmark,
  getLearnPost,
  setBookmark,
  type LearnBlock,
  type LearnPost,
} from '@/api/learn';
import { Button } from '@/components/ui/Button';
import { BackButton, Callout, Card, Cover, HexBadge, Raised, Ribbon } from '@/components/ui/Game';
import { Notice } from '@/components/ui/Screen';
import { StateScreen } from '@/components/ui/StateScreen';
import { Text } from '@/components/ui/Text';
import { KIND } from '@/features/learn/screens/LearnScreen';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

function ContentBlock({ block }: { block: LearnBlock }) {
  switch (block.type) {
    case 'heading':
      return <Text style={styles.heading}>{block.text}</Text>;
    case 'paragraph':
      return <Text style={styles.paragraph}>{block.text}</Text>;
    case 'list':
      return (
        <View style={{ gap: 14 }}>
          {block.items.map((item, index) => (
            <View key={index} style={styles.item}>
              <View style={styles.tick}>
                {block.ordered ? (
                  <Text style={styles.number}>{index + 1}</Text>
                ) : (
                  <Check size={12} color={colors.ember} strokeWidth={3} />
                )}
              </View>
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case 'callout':
      return (
        <Callout
          tone={block.tone === 'info' ? 'info' : block.tone === 'success' ? 'success' : 'warning'}
        >
          {block.text}
        </Callout>
      );
    case 'image':
      return (
        <View style={{ gap: 8 }}>
          <Image
            source={{ uri: block.url }}
            accessibilityLabel={block.alt}
            style={styles.image}
            resizeMode="cover"
          />
          {!!block.alt && (
            <Text variant="small" dim>
              {block.alt}
            </Text>
          )}
        </View>
      );
    case 'video':
      return (
        <Card
          padding={12}
          contentStyle={styles.video}
          accessibilityLabel={`Xem video trên ${block.provider}`}
          onPress={() => {
            if (block.url.startsWith('https://')) void Linking.openURL(block.url);
          }}
        >
          <HexBadge icon={Play} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.extrabold, fontSize: 14, lineHeight: 19 }}>
              Xem video hướng dẫn
            </Text>
            <Text variant="small" muted>
              Mở trên {block.provider}
            </Text>
          </View>
          <ArrowUpRight size={18} color={colors.dim} strokeWidth={2.25} />
        </Card>
      );
    default:
      return <Notice>Ứng dụng chưa hỗ trợ block nội dung này.</Notice>;
  }
}

export default function LearnPostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { account } = useSession();
  const [post, setPost] = useState<LearnPost | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof slug !== 'string') return;
    let active = true;
    setBusy(true);
    getLearnPost(slug)
      .then(async (result) => {
        if (!active) return;
        setPost(result);
        if (account) {
          const state = await getBookmark(result.id);
          if (active) setBookmarked(state.bookmarked);
        }
      })
      .catch((issue) => {
        if (!active) return;
        if (issue instanceof ApiError && issue.status === 404) setMissing(true);
        else setError(issue instanceof Error ? issue.message : 'Không tải được bài Learn.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [slug, account]);

  async function toggleBookmark() {
    if (!post) return;
    setBusy(true);
    setError('');
    try {
      setBookmarked((await setBookmark(post.id, !bookmarked)).bookmarked);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không lưu được bookmark.');
    } finally {
      setBusy(false);
    }
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/learn'));
  if (missing)
    return (
      <StateScreen
        header="Learn"
        onBack={back}
        icon={Search}
        tone="neutral"
        ribbon="Không tìm thấy"
        title="Bài này không còn công khai"
        body="Bài Learn đã bị gỡ hoặc đổi địa chỉ. Hãy xem các bài khác trong Learn."
        actions={
          <Button title="Về Learn" icon={ArrowUpRight} onPress={() => router.replace('/learn')} />
        }
      />
    );

  const version = post?.publishedVersion;
  const supported = version?.contentSchemaVersion === 'fet3d.learn/1';
  const kind = KIND[(version?.kind as keyof typeof KIND) ?? 'Article'] ?? KIND.Article;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View>
          {version?.coverImageUrl ? (
            <Image source={{ uri: version.coverImageUrl }} style={styles.cover} />
          ) : (
            <Cover icon={kind.icon} tone={kind.tone} height={200} badge={110} />
          )}
          <View style={styles.back}>
            <BackButton onPress={back} />
          </View>
        </View>
        <View style={styles.body}>
          {busy && !post && <ActivityIndicator color={colors.ember} />}
          {!!error && <Notice error>{error}</Notice>}
          {post && !supported && (
            <Notice error>Phiên bản nội dung chưa được ứng dụng hỗ trợ.</Notice>
          )}
          {version && supported && (
            <>
              <Ribbon label={kind.label} />
              <Text variant="title">{version.title}</Text>
              {!!version.summary && <Text style={styles.paragraph}>{version.summary}</Text>}
              {version.blocks.map((block, index) => (
                <ContentBlock key={index} block={block} />
              ))}
              <Callout tone="warning">
                Nội dung chỉ mang tính hướng dẫn, không thay thế chỉ dẫn của lực lượng PCCC tại hiện
                trường.
              </Callout>
            </>
          )}
        </View>
      </ScrollView>
      {post && supported && (
        <View style={styles.actions}>
          {account ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={bookmarked ? 'Bỏ lưu bài' : 'Lưu bài'}
                accessibilityState={{ selected: bookmarked, disabled: busy }}
                disabled={busy}
                onPress={() => void toggleBookmark()}
              >
                {({ pressed }) => (
                  <Raised
                    depth={4}
                    shadow={colors.emberShadow}
                    radius={18}
                    pressed={pressed}
                    faceStyle={[styles.bookmark, bookmarked && { backgroundColor: colors.ember }]}
                  >
                    {bookmarked ? (
                      <BookmarkCheck size={24} color={colors.emberForeground} strokeWidth={2} />
                    ) : (
                      <Bookmark size={24} color={colors.ember} strokeWidth={2} />
                    )}
                  </Raised>
                )}
              </Pressable>
              <Button
                title="Hỏi AI về bài này"
                icon={Sparkle}
                disabled={busy}
                style={{ flex: 1 }}
                onPress={() =>
                  router.push({
                    pathname: '/ai',
                    params: { postId: post.id, versionId: post.publishedVersion.id },
                  })
                }
              />
            </>
          ) : (
            <Button
              title="Đăng nhập để lưu và hỏi AI"
              icon={ArrowUpRight}
              style={{ flex: 1 }}
              onPress={() => router.push('/login')}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  cover: { height: 200, width: '100%', backgroundColor: colors.surfaceRaised },
  back: { position: 'absolute', top: 12, left: 16 },
  body: {
    flex: 1,
    gap: 14,
    padding: 20,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.lineStrong,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  heading: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 24 },
  paragraph: { fontSize: 15, lineHeight: 24, color: colors.muted },
  item: { flexDirection: 'row', gap: 10 },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.ember,
    backgroundColor: colors.emberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { fontFamily: fonts.black, fontSize: 11, lineHeight: 14, color: colors.ember },
  itemText: { flex: 1, fontSize: 15, lineHeight: 22 },
  image: { width: '100%', height: 200, borderRadius: 16, backgroundColor: colors.surfaceRaised },
  video: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  bookmark: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.ember,
    backgroundColor: colors.emberSoft,
  },
});
