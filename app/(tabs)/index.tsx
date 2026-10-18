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
      <Button title="Khám phá Learn" icon="book-outline" onPress={() => router.push('/learn')} />
      <Button
        title="Trợ lý AI"
        icon="sparkles-outline"
        variant="secondary"
        onPress={() => router.push('/ai')}
      />
      <Button
        title="Lịch sử và kết quả"
        icon="time-outline"
        variant="secondary"
        onPress={() => router.push('/history')}
      />
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
        Quét QR của Building để chọn bài tập và chế độ. Tải gói và vào phiên Unity cần ứng dụng
        Android có tích hợp Unity và kết nối mạng khi bắt đầu.
      </Notice>
    </Screen>
  );
}
