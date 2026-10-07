import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components/ui/Button';
import { Screen, PageHeader, Notice } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';
import { findTraining } from '@/features/buildings/buildings.model';
import { formatDuration, gameScenes, getModeLabel } from '@/features/game/game.model';

export default function ResultDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { state } = useDemo();
  const result =
    typeof sessionId === 'string'
      ? state.results.find((candidate) => candidate.id === sessionId)
      : undefined;
  const match = result ? findTraining(result.trainingId) : null;
  if (!result || !match)
    return (
      <Screen>
        <PageHeader title="Không tìm thấy kết quả" onBack={() => router.back()} />
        <Notice error>Kết quả không tồn tại hoặc đường dẫn không hợp lệ.</Notice>
        <Button title="Về danh sách kết quả" onPress={() => router.dismissTo('/(tabs)/results')} />
      </Screen>
    );

  const routeLabels = result.chosenChoiceIds.map((choiceId) => {
    for (const scene of Object.values(gameScenes)) {
      const choice = scene.choices.find((candidate) => candidate.id === choiceId);
      if (choice) return choice.label;
    }
    return choiceId;
  });

  return (
    <Screen>
      <PageHeader title="Debrief cá nhân" onBack={() => router.back()} />
      <View style={styles.hero}>
        <View style={styles.medal}>
          <Ionicons name="ribbon" size={42} color={colors.green} />
        </View>
        <Text variant="small" style={styles.success}>
          ĐÃ HOÀN THÀNH · {getModeLabel(result.mode).toUpperCase()}
        </Text>
        <Text variant="title" style={styles.center}>
          {match.training.title}
        </Text>
        <Text muted style={styles.center}>
          {match.building.name}
        </Text>
      </View>
      <View style={styles.metrics}>
        {result.score !== null && (
          <Metric label="Điểm mô phỏng" value={`${result.score}`} icon="trophy-outline" />
        )}
        <Metric
          label="Thời lượng"
          value={formatDuration(result.elapsedSeconds)}
          icon="time-outline"
        />
        <Metric
          label="Tiếp xúc mô phỏng"
          value={`${result.modeledExposure}%`}
          icon="pulse-outline"
        />
        <Metric label="Đổi tuyến" value={`${result.replanCount}`} icon="git-compare-outline" />
      </View>
      <View style={styles.section}>
        <Text variant="heading">Hành trình đã chọn</Text>
        {routeLabels.map((label, index) => (
          <View key={`${label}-${index}`} style={styles.routeRow}>
            <View style={styles.step}>
              <Text variant="small">{index + 1}</Text>
            </View>
            <Text style={styles.routeText}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <Text variant="heading">Điều cần ghi nhớ</Text>
        <Text muted>
          {result.mode === 'learn'
            ? 'Bạn đã quan sát các mốc không gian và hoàn thành hành trình làm quen.'
            : result.wrongChoices > 0
              ? 'Bạn đã gặp một nhánh bị chặn và thực hiện re-plan trong scenario mẫu.'
              : 'Bạn giữ được tuyến đang khả dụng trong suốt scenario mẫu.'}
        </Text>
      </View>
      <Notice>
        Dữ liệu local-only · Chưa đồng bộ backend. Điểm, route và modeled exposure chỉ thuộc mô
        phỏng, không phải chứng nhận hoặc hướng dẫn trong sự cố thật.
      </Notice>
      <Button
        title="Tập lại bài này"
        icon="refresh-outline"
        onPress={() =>
          router.replace({ pathname: '/training/[id]', params: { id: match.building.id } })
        }
      />
      <Button
        title="Về danh sách kết quả"
        variant="secondary"
        onPress={() => router.dismissTo('/(tabs)/results')}
      />
    </Screen>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: 'trophy-outline' | 'time-outline' | 'pulse-outline' | 'git-compare-outline';
}) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={22} color={colors.green} />
      <Text variant="heading">{value}</Text>
      <Text variant="small" muted style={styles.center}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 7 },
  medal: {
    width: 82,
    height: 82,
    borderRadius: 28,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  success: { color: colors.green, letterSpacing: 0.7 },
  center: { textAlign: 'center' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    width: '48%',
    minHeight: 124,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    flexGrow: 1,
  },
  section: { gap: 12 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeText: { flex: 1 },
});
