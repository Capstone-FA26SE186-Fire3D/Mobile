import { useCallback, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Application from 'expo-application';
import { Bookmark, Info, LifeBuoy, Sparkle, User, X } from 'lucide-react-native';
import { Screen, Notice, ScreenTitle } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card, HexBadge, ListRow, Pill } from '@/components/ui/Game';
import { colors, fonts } from '@/theme/tokens';
import { useSession } from '@/store/SessionProvider';
import { getCurrentAvatar } from '@/api/auth';
import { listBookmarks } from '@/api/learn';
import { getAiQuota } from '@/api/trainee-ai';
import { supportApi } from '@/api/support';
import { APP_RUNTIME_VERSION } from '@/features/training/runtime-version';

type Summary = { bookmarks?: number; ai?: string; openTickets?: number };
const CLOSED = /closed|resolved|cancel/i;

export default function ProfileScreen() {
  const { account, signOut } = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!account) {
        setAvatarUrl(null);
        return;
      }
      let active = true;
      getCurrentAvatar()
        .then((avatar) => {
          if (active) setAvatarUrl(avatar?.url ?? account.avatarUrl ?? null);
        })
        .catch(() => {
          if (active) setAvatarUrl(account.avatarUrl ?? null);
        });
      // Row subtitles are informative only; a failed lookup just leaves the default text.
      listBookmarks(1)
        .then((page) => active && setSummary((s) => ({ ...s, bookmarks: page.total })))
        .catch(() => undefined);
      getAiQuota()
        .then((quota) => {
          if (!active) return;
          const ai = !quota.policyActive
            ? 'Chưa bật cho tài khoản'
            : quota.dailyUnits
              ? `Còn ${quota.remainingUnits}/${quota.dailyUnits} lượt hôm nay`
              : `Còn ${quota.remainingUnits} lượt hôm nay`;
          setSummary((s) => ({ ...s, ai }));
        })
        .catch(() => undefined);
      supportApi
        .listTickets()
        .then(
          (tickets) =>
            active &&
            setSummary((s) => ({
              ...s,
              openTickets: tickets.filter((t) => !CLOSED.test(t.status)).length,
            })),
        )
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [account?.id, account?.avatarUrl]),
  );
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await signOut();
    } catch (issue) {
      setError(
        `Chưa thu hồi được thiết bị. Phiên vẫn còn: ${issue instanceof Error ? issue.message : String(issue)}`,
      );
    } finally {
      setBusy(false);
    }
  }
  const version = Application.nativeApplicationVersion;
  return (
    <Screen contentStyle={styles.content}>
      <ScreenTitle>Tôi</ScreenTitle>
      <Card contentStyle={styles.profile}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={styles.avatar}
            accessibilityLabel="Ảnh đại diện"
          />
        ) : (
          <HexBadge icon={User} size={96} />
        )}
        <Text style={styles.name}>{account?.fullName || account?.username}</Text>
        <Text variant="small" muted style={{ fontSize: 13 }}>
          {account?.email}
        </Text>
        <View style={styles.pills}>
          <Pill label="Trainee" tone="ember" />
          {account?.emailVerifiedAt && <Pill label="Email đã xác minh" tone="success" />}
        </View>
      </Card>
      <Card padding={8}>
        <ListRow
          icon={Bookmark}
          tone="warning"
          title="Bài đã lưu"
          subtitle={
            summary.bookmarks === undefined
              ? 'Bài Learn bạn đã đánh dấu'
              : `${summary.bookmarks} bài`
          }
          onPress={() => router.push('/learn/bookmarks')}
        />
        <ListRow
          icon={Sparkle}
          title="Hỏi AI"
          subtitle={summary.ai ?? 'Hỏi về bài Learn và kết quả của bạn'}
          onPress={() => router.push('/ai')}
        />
        <ListRow
          icon={LifeBuoy}
          tone="success"
          title="Hỗ trợ & phản hồi"
          subtitle={
            summary.openTickets
              ? `${summary.openTickets} yêu cầu đang mở`
              : 'Gửi phản hồi hoặc yêu cầu hỗ trợ'
          }
          onPress={() => router.push('/support')}
        />
        <ListRow
          icon={User}
          tone="info"
          title="Cài đặt tài khoản"
          subtitle="Hồ sơ, bảo mật, thông báo"
          onPress={() => router.push('/account-settings')}
        />
      </Card>
      <Card padding={8}>
        <ListRow
          icon={Info}
          tone="info"
          title="Phiên bản ứng dụng"
          subtitle={`FET3D ${version ?? ''} · runtime ${APP_RUNTIME_VERSION}`.replace('  ', ' ')}
        />
      </Card>
      {!!error && <Notice error>{error}</Notice>}
      <Button
        title="Đăng xuất"
        icon={X}
        variant="danger"
        size="sm"
        loading={busy}
        onPress={() => void logout()}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  profile: { alignItems: 'center', gap: 8 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: colors.hardShadow,
    backgroundColor: colors.surfaceRaised,
  },
  name: { fontFamily: fonts.black, fontSize: 21, lineHeight: 28, textAlign: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
});
