import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, Linking, StyleSheet, View } from 'react-native';
import {
  getBookmark,
  getLearnPost,
  setBookmark,
  type LearnBlock,
  type LearnPost,
} from '@/api/learn';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/store/SessionProvider';
import { colors } from '@/theme/tokens';

function ContentBlock({ block }: { block: LearnBlock }) {
  switch (block.type) {
    case 'heading':
      return <Text variant="heading">{block.text}</Text>;
    case 'paragraph':
      return <Text>{block.text}</Text>;
    case 'list':
      return (
        <View style={styles.blocks}>
          {block.items.map((item, index) => (
            <Text key={index}>
              {block.ordered ? `${index + 1}.` : '•'} {item}
            </Text>
          ))}
        </View>
      );
    case 'callout':
      return <Notice>{block.text}</Notice>;
    case 'image':
      return (
        <View style={styles.blocks}>
          <Image
            source={{ uri: block.url }}
            accessibilityLabel={block.alt}
            style={styles.image}
            resizeMode="contain"
          />
          <Text muted>{block.alt}</Text>
        </View>
      );
    case 'video':
      return (
        <Button
          title={`Xem video trên ${block.provider}`}
          variant="secondary"
          onPress={() => {
            if (block.url.startsWith('https://')) void Linking.openURL(block.url);
          }}
        />
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
        if (active) setError(issue instanceof Error ? issue.message : 'Không tải được bài Learn.');
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

  return (
    <Screen>
      <PageHeader title="Learn" onBack={() => router.back()} />
      {busy && <ActivityIndicator color={colors.primary} />}
      {!!error && <Notice error>{error}</Notice>}
      {post && post.publishedVersion?.contentSchemaVersion === 'fet3d.learn/1' && (
        <View style={styles.blocks}>
          <Text variant="title">{post.publishedVersion.title}</Text>
          <Text muted>{post.publishedVersion.summary}</Text>
          {post.publishedVersion.blocks.map((block, index) => (
            <ContentBlock key={index} block={block} />
          ))}
          {account ? (
            <>
              <Button
                title={bookmarked ? 'Bỏ bookmark' : 'Lưu bookmark'}
                disabled={busy}
                variant="secondary"
                onPress={() => void toggleBookmark()}
              />
              <Button
                title="Hỏi AI về bài này"
                disabled={busy}
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
              variant="secondary"
              onPress={() => router.push('/login')}
            />
          )}
        </View>
      )}
      {post && post.publishedVersion?.contentSchemaVersion !== 'fet3d.learn/1' && (
        <Notice error>Phiên bản nội dung chưa được ứng dụng hỗ trợ.</Notice>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: 16 },
  image: { width: '100%', height: 220, backgroundColor: colors.surface, borderRadius: 12 },
});
