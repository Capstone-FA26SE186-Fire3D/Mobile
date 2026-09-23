import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, PageHeader, Notice } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';
import {
  buildings,
  getLaunchIssue,
  trainingModes,
  type TrainingMode,
} from '@/features/buildings/buildings.model';
import { BuildingArt } from '@/features/buildings/components/BuildingArt';

export default function TrainingScreen() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { state, startSession, resumeSession } = useDemo();
  const building =
    typeof id === 'string'
      ? buildings.find((b) => b.id === id && state.saved.some((s) => s.id === b.id))
      : undefined;
  const [trainingId, setTrainingId] = useState('');
  const [mode, setMode] = useState<TrainingMode>('guided');
  const [preparing, setPreparing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    setTrainingId('');
    setMode('guided');
    setPreparing(false);
    if (timer.current) clearTimeout(timer.current);
  }, [id]);
  if (!building)
    return (
      <Screen>
        <PageHeader title="Không tìm thấy tòa nhà" />
        <Notice error>Tòa nhà chưa được lưu hoặc đường dẫn không hợp lệ.</Notice>
        <Button title="Về sảnh tòa nhà" onPress={() => router.dismissTo('/(tabs)')} />
      </Screen>
    );
  const issue = getLaunchIssue(building);
  const selectedTraining =
    building.trainings.find((training) => training.id === trainingId) ?? building.trainings[0];
  const resumable = state.sessions.find(
    (session) =>
      session.buildingId === building.id &&
      session.trainingId === selectedTraining.id &&
      session.status !== 'completed',
  );
  function prepare() {
    if (preparing || issue || selectedTraining.status !== 'active') return;
    setPreparing(true);
    // UI-only preparation: it never claims to download or verify a production package.
    timer.current = setTimeout(() => {
      const sessionId = startSession(selectedTraining.id, mode);
      router.replace({ pathname: '/game/[sessionId]', params: { sessionId } });
    }, 900);
  }
  function resume() {
    if (!resumable) return;
    resumeSession(resumable.id);
    router.push({ pathname: '/game/[sessionId]', params: { sessionId: resumable.id } });
  }
  return (
    <Screen>
      <PageHeader
        title={preparing ? 'Chuẩn bị không gian' : 'Chọn bài tập huấn'}
        onBack={() => router.dismissTo('/(tabs)')}
      />
      {source === 'scan' && <Notice>Đã lưu tòa nhà vào sảnh của bạn.</Notice>}
      <View style={styles.artStage}>
        <View style={styles.halo} />
        <BuildingArt kind={building.art} style={styles.art} />
        <View style={styles.kind}>
          <Text variant="small">
            {building.kind} · {building.floors} tầng
          </Text>
        </View>
      </View>
      <View style={styles.title}>
        <Text variant="title">{building.name}</Text>
        <Text muted>Chọn bài và cách bạn muốn trải nghiệm mô phỏng.</Text>
      </View>
      {issue ? (
        <>
          <Notice error>{issue}</Notice>
          <Button
            title="Quét mã QR mới"
            icon="qr-code-outline"
            onPress={() => router.replace('/scan')}
          />
        </>
      ) : preparing ? (
        <View style={styles.preparing} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.green} />
          <Text variant="label">Đang chuẩn bị cảnh mô phỏng…</Text>
          <Text variant="small" muted>
            Dùng dữ liệu cục bộ; không tải package hoặc kiểm tra entitlement thật.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.sectionHeading}>
            <Text variant="heading">Bài đang mở</Text>
            <Text variant="small" muted>
              {building.trainings.length} bài mẫu
            </Text>
          </View>
          {building.trainings.map((training) => (
            <Pressable
              key={training.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedTraining.id === training.id }}
              accessibilityLabel={`Chọn bài ${training.title}`}
              onPress={() => setTrainingId(training.id)}
              style={[
                styles.trainingCard,
                selectedTraining.id === training.id && styles.selectedCard,
              ]}
            >
              <View style={styles.trainingIcon}>
                <Ionicons name="flag-outline" size={22} color={colors.green} />
              </View>
              <View style={styles.trainingCopy}>
                <Text variant="label">{training.title}</Text>
                <Text variant="small" muted>
                  {training.summary}
                </Text>
                <View style={styles.meta}>
                  <Ionicons name="time-outline" size={15} color={colors.muted} />
                  <Text variant="small" muted>
                    Khoảng {training.minutes} phút
                  </Text>
                </View>
              </View>
              <Ionicons
                name={selectedTraining.id === training.id ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={selectedTraining.id === training.id ? colors.green : colors.muted}
              />
            </Pressable>
          ))}
          <Text variant="heading">Chọn chế độ</Text>
          <View accessibilityRole="radiogroup" style={styles.modes}>
            {trainingModes.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: mode === item.id }}
                accessibilityLabel={item.title}
                onPress={() => setMode(item.id)}
                style={[styles.modeCard, mode === item.id && styles.selectedMode]}
              >
                <View style={styles.modeTop}>
                  <View style={styles.modeIcon}>
                    <Ionicons name={item.icon} size={21} color={colors.green} />
                  </View>
                  <View style={styles.modeTitle}>
                    <Text variant="label">{item.title}</Text>
                    <Text variant="small" muted>
                      {item.shortTitle}
                    </Text>
                  </View>
                  {mode === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.green} />
                  )}
                </View>
                <Text variant="small" muted>
                  {item.description}
                </Text>
              </Pressable>
            ))}
          </View>
          {resumable && (
            <Notice>
              Bạn có một phiên {resumable.mode === 'assessment' ? 'Assessment' : 'mô phỏng'} đang
              lưu ở bước {resumable.checkpoint.sequence + 1}.
            </Notice>
          )}
          {resumable && (
            <Button
              title="Tiếp tục phiên đã lưu"
              icon="play-forward-outline"
              variant="secondary"
              onPress={resume}
            />
          )}
          <Button title="Bắt đầu mô phỏng" icon="play-outline" onPress={prepare} />
        </>
      )}
      <Text variant="small" muted style={styles.disclaimer}>
        Nội dung mẫu dành cho trải nghiệm giao diện. Kết quả tập huấn không thay thế hướng dẫn khẩn
        cấp tại hiện trường.
      </Text>
    </Screen>
  );
}
const styles = StyleSheet.create({
  artStage: { height: 245, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 240,
    height: 210,
    borderRadius: 100,
    backgroundColor: colors.greenSoft,
  },
  art: { width: 245, height: 245 },
  kind: {
    position: 'absolute',
    bottom: 0,
    borderRadius: 20,
    backgroundColor: colors.surface,
    paddingHorizontal: 15,
    paddingVertical: 6,
  },
  title: { alignItems: 'center', gap: 8 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trainingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  selectedCard: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  trainingIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trainingCopy: { flex: 1, gap: 5 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  modes: { gap: 10 },
  modeCard: {
    minHeight: 92,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 15,
    gap: 8,
  },
  selectedMode: { borderColor: colors.green, backgroundColor: '#F0F3E9' },
  modeTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTitle: { flex: 1 },
  preparing: {
    padding: 25,
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.greenSoft,
    borderRadius: 20,
  },
  disclaimer: { textAlign: 'center' },
});
