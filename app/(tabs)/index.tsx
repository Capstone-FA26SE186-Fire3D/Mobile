import { router } from 'expo-router';
import { View } from 'react-native';
import { Brand, Button } from '@/components/ui/Button';
import { Notice, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/store/SessionProvider';

export default function HomeScreen() {
  const { account } = useSession();
  return (
    <Screen>
      <Brand />
      <View style={{ gap: 8, marginVertical: 12 }}>
        <Text variant="title">Xin chào, {account?.fullName || account?.username || 'Trainee'}</Text>
        <Text muted>Quản lý tài khoản và gửi phản hồi cho đội Fire3D.</Text>
      </View>
      <Button
        title="Quét QR hoặc nhập mã Building"
        icon="qr-code-outline"
        onPress={() => router.push('/scan-qr')}
      />
      <Button
        title="Mở tài khoản"
        icon="person-outline"
        onPress={() => router.push('/(tabs)/profile')}
      />
      <Button
        title="Phản hồi và hỗ trợ"
        icon="chatbubble-outline"
        variant="secondary"
        onPress={() => router.push('/support')}
      />
      <Notice>
        Chọn một Building để xem bài tập được phép. Phiên tập huấn Unity sẽ xuất hiện khi package và
        runtime được tích hợp.
      </Notice>
    </Screen>
  );
}
