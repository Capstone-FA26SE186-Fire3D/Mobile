import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Screen, Notice } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';
import { findTraining } from '@/features/buildings/buildings.model';
import { formatDuration, getModeLabel } from '@/features/game/game.model';
export default function ResultsScreen() {
  const { state } = useDemo();
  const results = [...state.results].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return (
    <Screen scroll={false}>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text muted>HÀNH TRÌNH CỦA BẠN</Text>
            <Text variant="title">Mỗi lần tập,{'\n'}một điều học được.</Text>
            {results.length > 0 && (
              <Notice>Kết quả mẫu chỉ được lưu cục bộ, chưa đồng bộ với backend.</Notice>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const match = findTraining(item.trainingId);
          if (!match) return null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Xem kết quả ${match.training.title}`}
              onPress={() =>
                router.push({ pathname: '/results/[sessionId]', params: { sessionId: item.id } })
              }
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.resultIcon}>
                <Ionicons name="ribbon-outline" size={27} color={colors.green} />
              </View>
              <View style={styles.cardCopy}>
                <Text variant="small" muted>
                  {match.building.shortName} · {getModeLabel(item.mode)}
                </Text>
                <Text variant="label">{match.training.title}</Text>
                <Text variant="small" muted>
                  {formatDuration(item.elapsedSeconds)} · tiếp xúc mô phỏng {item.modeledExposure}%
                  {item.score === null ? '' : ` · ${item.score} điểm`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.medal}>
              <Ionicons name="ribbon-outline" size={70} color={colors.green} />
            </View>
            <Text variant="heading">Kết quả đầu tiên đang chờ bạn</Text>
            <Text muted style={styles.center}>
              Hoàn thành một phiên mô phỏng để xem lựa chọn, modeled exposure và debrief tại đây.
            </Text>
            <Button
              title="Khám phá tòa nhà"
              icon="map-outline"
              onPress={() => router.push('/(tabs)')}
            />
          </View>
        }
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: 24, paddingBottom: 36, gap: 14 },
  header: { gap: 14, marginBottom: 8 },
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
  center: { textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 15,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  resultIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: { flex: 1, gap: 4 },
});
