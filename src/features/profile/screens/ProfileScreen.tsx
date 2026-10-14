import { useCallback, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Screen, Notice } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/tokens';
import { useSession } from '@/store/SessionProvider';
import { getCurrentAvatar } from '@/api/auth';

export default function ProfileScreen() {
  const { account, signOut } = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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
  return (
    <Screen>
      <Text variant="title">Tài khoản</Text>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImage}
              accessibilityLabel="Ảnh đại diện"
            />
          ) : (
            <Text variant="title">
              {(account?.fullName || account?.username || 'T').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <Text variant="heading">{account?.fullName || account?.username}</Text>
        <Text muted>{account?.email}</Text>
        <Text variant="small" style={{ color: colors.green }}>
          Trainee
        </Text>
      </View>
      <Button
        title="Cài đặt tài khoản"
        icon="person-outline"
        variant="secondary"
        onPress={() => router.push('/account-settings')}
      />
      <Button
        title="Phản hồi và hỗ trợ"
        icon="chatbubble-outline"
        variant="secondary"
        onPress={() => router.push('/support')}
      />
      {!!error && <Notice error>{error}</Notice>}
      <Button
        title="Đăng xuất"
        icon="log-out-outline"
        variant="secondary"
        loading={busy}
        onPress={() => void logout()}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: 10, paddingVertical: 18 },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 29,
    backgroundColor: colors.greenSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    overflow: 'hidden',
  },
  avatarImage: { width: 82, height: 82 },
});
