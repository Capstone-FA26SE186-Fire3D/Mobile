import { useCallback, useState } from 'react';
import { Image, Modal, StyleSheet, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, Notice } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';
import { DEMO_EMAIL } from '@/store/demo.model';
import { getCurrentAvatar } from '@/api/auth';
export default function ProfileScreen() {
  const { state, account, signOut, loadExamples, clearBuildings, setReducedMotion, reduceMotion } =
    useDemo();
  const [confirm, setConfirm] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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
            <Text variant="title">{(account?.fullName ?? 'B').charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <Text variant="heading">
          {account?.fullName || (account ? 'Người tập huấn' : 'Bạn trải nghiệm')}
        </Text>
        <Text muted>{account?.email ?? DEMO_EMAIL}</Text>
        <View style={styles.pill}>
          <Text variant="small" style={{ color: colors.green }}>
            {account ? 'Học viên' : 'Tài khoản mẫu'}
          </Text>
        </View>
      </View>
      {!!account && (
        <>
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
        </>
      )}
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="label">Giảm chuyển động</Text>
          <Text variant="small" muted>
            Tắt chuyển cảnh và chuyển động trang trí
          </Text>
        </View>
        <Switch
          accessibilityLabel="Giảm chuyển động"
          value={state.reducedMotion}
          onValueChange={setReducedMotion}
          trackColor={{ false: '#D9DDCF', true: colors.green }}
        />
      </View>
      <View style={styles.section}>
        <Text variant="heading">Không gian trải nghiệm</Text>
        <Text muted>{state.saved.length} tòa nhà đã lưu trên thiết bị này.</Text>
        <Button
          title="Nạp 3 tòa nhà mẫu"
          icon="cube-outline"
          variant="secondary"
          onPress={() => {
            loadExamples();
            router.push('/(tabs)');
          }}
        />
        <Button
          title="Xóa danh sách tòa nhà mẫu"
          variant="ghost"
          disabled={!state.saved.length}
          onPress={() => setConfirm(true)}
        />
      </View>
      {!account && (
        <Notice>
          Đây là bản trải nghiệm giao diện. Tài khoản, tòa nhà và bài tập đều là dữ liệu mẫu; không
          có dữ liệu tài khoản thật.
        </Notice>
      )}
      <Button
        title="Đăng xuất"
        icon="log-out-outline"
        variant="secondary"
        onPress={() => void signOut()}
      />
      <Modal
        visible={confirm}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setConfirm(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Ionicons name="trash-outline" size={32} color={colors.red} />
            <Text variant="heading">Xóa danh sách mẫu?</Text>
            <Text muted>
              Các tòa nhà mẫu đã lưu sẽ được xóa khỏi thiết bị. Bạn có thể nạp lại bất cứ lúc nào.
            </Text>
            <Button
              title="Xóa danh sách"
              onPress={() => {
                clearBuildings();
                setConfirm(false);
              }}
            />
            <Button title="Giữ lại" variant="secondary" onPress={() => setConfirm(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
const styles = StyleSheet.create({
  profile: { alignItems: 'center', gap: 10, paddingVertical: 12 },
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
  pill: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 6,
    backgroundColor: colors.greenSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: 18,
  },
  section: { gap: 14 },
  overlay: {
    flex: 1,
    backgroundColor: '#252B2D77',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    padding: 25,
    backgroundColor: colors.surface,
    borderRadius: 24,
    gap: 18,
  },
});
