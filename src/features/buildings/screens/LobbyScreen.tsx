import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Brand, Button, IconButton } from '@/components/ui/Button';
import { colors } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';
import { buildings, type Building } from '../buildings.model';
import { BuildingMap } from '../components/BuildingMap';
import { BuildingSheet } from '../components/BuildingSheet';

export default function LobbyScreen() {
  const { state, loadExamples, reduceMotion } = useDemo();
  const [selected, setSelected] = useState<Building | null>(null);
  const items = buildings.filter((b) => state.saved.some((saved) => saved.id === b.id));
  return (
    <Screen scroll={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <Brand small />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở tài khoản"
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.avatar}
          >
            <Text variant="label">B</Text>
          </Pressable>
        </View>
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(350)}
          style={styles.heading}
        >
          <Text muted>Chào bạn, sẵn sàng khám phá?</Text>
          <View style={styles.titleRow}>
            <Text variant="title" style={{ flex: 1 }}>
              Tòa nhà của bạn
            </Text>
            <IconButton
              name="list-outline"
              label="Danh sách tòa nhà"
              onPress={() => router.push('/buildings')}
            />
          </View>
          <Text muted style={{ fontSize: 13 }}>
            Mỗi không gian quen thuộc, một bước chủ động hơn.
          </Text>
        </Animated.View>
        {items.length ? (
          <>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Ionicons name="cube-outline" color={colors.green} size={16} />
                <Text variant="small">{items.length} tòa nhà đã lưu</Text>
              </View>
              <Text variant="small" muted>
                Dữ liệu trải nghiệm
              </Text>
            </View>
            <BuildingMap items={items} onSelect={setSelected} />
          </>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyPlot}>
              <Ionicons name="scan-outline" size={61} color={colors.green} />
              <View style={styles.miniPlus}>
                <Ionicons name="add" size={22} color={colors.ink} />
              </View>
            </View>
            <Text variant="heading">Một hành trình mới bắt đầu</Text>
            <Text muted style={styles.center}>
              Quét mã QR tại tòa nhà để thêm không gian tập huấn đầu tiên của bạn.
            </Text>
            <Button
              title="Quét tòa nhà đầu tiên"
              icon="qr-code-outline"
              onPress={() => router.push('/scan')}
            />
            <Pressable accessibilityRole="button" onPress={loadExamples} style={styles.sampleLink}>
              <Text variant="label" style={{ color: colors.green }}>
                Xem sảnh với 3 tòa nhà mẫu
              </Text>
              <Ionicons name="arrow-forward" size={16} color={colors.green} />
            </Pressable>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hỏi trợ lý AI"
          onPress={() => router.push('/chat')}
          style={styles.tip}
        >
          <View style={styles.tipIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={23} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label">Có điều bạn muốn tìm hiểu?</Text>
            <Text variant="small" muted>
              Hỏi trợ lý AI từ tài liệu đã cung cấp
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.muted} />
        </Pressable>
      </ScrollView>
      {items.length > 0 && (
        <View style={styles.scanFooter}>
          <Button
            title="Quét QR thêm tòa nhà"
            icon="qr-code-outline"
            onPress={() => router.push('/scan')}
          />
        </View>
      )}
      <BuildingSheet building={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: {
    padding: 24,
    paddingBottom: 16,
    gap: 20,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  scanFooter: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: colors.background,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: '#E6EAD9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  heading: { gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: -9,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: {
    padding: 24,
    borderRadius: 26,
    backgroundColor: '#EAECDD',
    borderWidth: 1,
    borderColor: '#DCE1D1',
    alignItems: 'center',
    gap: 18,
  },
  emptyPlot: {
    marginTop: 28,
    marginBottom: 16,
    width: 145,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCE3CC',
    borderRadius: 36,
    borderBottomWidth: 8,
    borderColor: '#CAD4B7',
    transform: [{ rotate: '-6deg' }],
  },
  miniPlus: {
    position: 'absolute',
    bottom: 5,
    right: -7,
    backgroundColor: colors.primary,
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  sampleLink: { minHeight: 48, flexDirection: 'row', gap: 6, alignItems: 'center' },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  tipIcon: {
    width: 42,
    height: 42,
    backgroundColor: colors.greenSoft,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
