import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/tokens';
export default function ResultsScreen() {
  return (
    <Screen>
      <Text muted>HÀNH TRÌNH CỦA BẠN</Text>
      <Text variant="title">Mỗi lần tập,{'\n'}một điều học được.</Text>
      <View style={styles.empty}>
        <View style={styles.medal}>
          <Ionicons name="ribbon-outline" size={70} color={colors.green} />
        </View>
        <Text variant="heading">Kết quả đầu tiên đang chờ bạn</Text>
        <Text muted style={{ textAlign: 'center' }}>
          Sau khi hoàn thành một buổi tập huấn, kết quả và những điều cần ghi nhớ sẽ xuất hiện ở
          đây.
        </Text>
        <Button
          title="Khám phá tòa nhà"
          icon="map-outline"
          onPress={() => router.push('/(tabs)')}
        />
      </View>
      <Text variant="small" muted>
        Bản trải nghiệm chưa tạo phiên tập huấn hoặc điểm số.
      </Text>
    </Screen>
  );
}
const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 23, paddingVertical: 30 },
  medal: {
    height: 170,
    width: 170,
    borderRadius: 55,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 8,
    borderColor: '#D3DDCB',
    transform: [{ rotate: '-7deg' }],
    marginBottom: 15,
  },
});
