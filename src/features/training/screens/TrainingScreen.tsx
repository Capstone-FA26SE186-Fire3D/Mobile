import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Screen, PageHeader, Notice } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';
import { buildings, getLaunchIssue } from '@/features/buildings/buildings.model';
import { BuildingArt } from '@/features/buildings/components/BuildingArt';

export default function TrainingScreen() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { state } = useDemo();
  const building =
    typeof id === 'string'
      ? buildings.find((b) => b.id === id && state.saved.some((s) => s.id === b.id))
      : undefined;
  const [phase, setPhase] = useState<'overview' | 'preparing' | 'unavailable'>('overview');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    setPhase('overview');
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
  function prepare() {
    if (phase === 'preparing' || issue) return;
    setPhase('preparing');
    // Demonstrates the preparation UI only; never claims to download a package or launch Unity.
    timer.current = setTimeout(() => setPhase('unavailable'), 1200);
  }
  return (
    <Screen>
      <PageHeader
        title={phase === 'overview' ? 'Sẵn sàng tập huấn' : 'Chuẩn bị không gian'}
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
        <Text muted>{building.training}</Text>
      </View>
      <View style={styles.details}>
        <View style={styles.detail}>
          <Ionicons name="time-outline" size={23} color={colors.green} />
          <Text variant="label">{building.minutes} phút</Text>
          <Text variant="small" muted>
            Thời lượng dự kiến
          </Text>
        </View>
        <View style={styles.detail}>
          <Ionicons name="compass-outline" size={23} color={colors.green} />
          <Text variant="label">Có hướng dẫn</Text>
          <Text variant="small" muted>
            Từng bước làm quen
          </Text>
        </View>
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
      ) : phase === 'preparing' ? (
        <View style={styles.preparing} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.green} />
          <Text variant="label">Đang chuẩn bị giao diện mẫu…</Text>
          <Text variant="small" muted>
            Không tải gói nội dung trong bản trải nghiệm.
          </Text>
        </View>
      ) : phase === 'unavailable' ? (
        <>
          <Notice>
            Giao diện đã sẵn sàng. Bản trải nghiệm chưa kết nối nội dung tập huấn và Unity, nên chưa
            thể bắt đầu trò chơi.
          </Notice>
          <Button title="Về sảnh tòa nhà" onPress={() => router.dismissTo('/(tabs)')} />
        </>
      ) : (
        <>
          <Text variant="heading">Trước khi bắt đầu</Text>
          <Text muted>
            Chọn một nơi thoải mái để thao tác. Bạn sẽ làm quen với không gian và luyện tập theo
            hướng dẫn trong bài.
          </Text>
          <Button title="Vào tập huấn" icon="play-outline" onPress={prepare} />
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
  details: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  detail: { flex: 1, alignItems: 'center', gap: 7 },
  preparing: {
    padding: 25,
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.greenSoft,
    borderRadius: 20,
  },
  disclaimer: { textAlign: 'center' },
});
