import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui/Text';
import { IconButton } from '@/components/ui/Button';
import { colors, shadows } from '@/theme/tokens';
import type { Building } from '../buildings.model';
import { BuildingArt } from './BuildingArt';
const plots: Record<string, { left: number; top: number }> = {
  'an-binh': { left: 0.04, top: 101 },
  'hoa-sen': { left: 0.54, top: 44 },
  'minh-khai': { left: 0.57, top: 182 },
};

export function BuildingMap({
  items,
  onSelect,
}: {
  items: Building[];
  onSelect: (item: Building) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(342);
  const canvasWidth = Math.max(viewport, 340);
  const artSize = Math.min(canvasWidth * 0.36, 145);
  return (
    <View style={styles.map} onLayout={(event) => setViewport(event.nativeEvent.layout.width)}>
      <LinearGradient colors={['#E8EDDE', '#F1EDDF']} style={StyleSheet.absoluteFill} />
      <View style={styles.legend}>
        <View style={styles.dot} />
        <Text variant="small">Khu tập huấn của bạn</Text>
      </View>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.canvas, { width: canvasWidth }]}
      >
        <View style={[styles.ground, { width: canvasWidth * 0.9 }]} />
        <View style={[styles.roadOne, { width: canvasWidth }]} />
        <View style={[styles.roadTwo, { width: canvasWidth * 0.8 }]} />
        <View style={[styles.roadLine, { width: canvasWidth - 20 }]} />
        {[
          { left: 12, top: 268 },
          { left: canvasWidth * 0.46, top: 150 },
          { left: canvasWidth * 0.88, top: 175 },
          { left: canvasWidth * 0.34, top: 304 },
        ].map((point, index) => (
          <View key={index} style={[styles.tree, point]}>
            <View style={styles.trunk} />
            <View style={styles.leaf} />
          </View>
        ))}
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`Mở ${item.name}`}
            onPress={() => onSelect(item)}
            style={({ pressed }) => [
              styles.plot,
              { left: plots[item.id].left * canvasWidth, top: plots[item.id].top, width: artSize },
              pressed && { transform: [{ scale: 0.96 }] },
            ]}
          >
            <BuildingArt kind={item.art} style={{ width: artSize, height: artSize }} />
            <View style={[styles.name, shadows.soft]}>
              <View
                style={[styles.dot, item.status === 'closed' && { backgroundColor: colors.muted }]}
              />
              <Text variant="label" style={{ fontSize: 12 }}>
                {item.shortName}
              </Text>
              <Ionicons name="chevron-forward" size={12} color={colors.muted} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.hint}>
          <Ionicons name="hand-left-outline" size={14} color={colors.muted} />
          <Text variant="small" muted>
            Chạm tòa nhà để khám phá
          </Text>
        </View>
        <IconButton
          name="locate-outline"
          label="Đưa bản đồ về giữa"
          onPress={() => scroll.current?.scrollTo({ x: 0, animated: false })}
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  map: {
    borderRadius: 26,
    overflow: 'hidden',
    height: 400,
    borderWidth: 1,
    borderColor: '#DCE1D1',
  },
  canvas: { height: 400 },
  legend: {
    position: 'absolute',
    top: 17,
    left: 18,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dot: { height: 7, width: 7, borderRadius: 4, backgroundColor: colors.green },
  ground: {
    position: 'absolute',
    width: 385,
    height: 245,
    borderRadius: 65,
    backgroundColor: '#DBE1CC',
    left: 16,
    top: 90,
    transform: [{ rotate: '-24deg' }],
  },
  roadOne: {
    position: 'absolute',
    width: 460,
    height: 36,
    left: 10,
    top: 230,
    backgroundColor: '#FAF7EE',
    transform: [{ rotate: '-24deg' }],
    borderWidth: 1,
    borderColor: '#E3DECD',
  },
  roadTwo: {
    position: 'absolute',
    width: 365,
    height: 31,
    left: 40,
    top: 220,
    backgroundColor: '#FAF7EE',
    transform: [{ rotate: '60deg' }],
  },
  roadLine: {
    position: 'absolute',
    width: 440,
    height: 1,
    top: 246,
    left: 20,
    backgroundColor: '#DCD6C7',
    transform: [{ rotate: '-24deg' }],
  },
  plot: { position: 'absolute', width: 170, alignItems: 'center', zIndex: 2 },
  building: { width: 173, height: 185 },
  name: {
    marginTop: -7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#DDE0D5',
  },
  tree: { position: 'absolute', width: 28, height: 44 },
  trunk: {
    position: 'absolute',
    backgroundColor: '#AA8764',
    height: 24,
    width: 5,
    left: 12,
    bottom: 0,
  },
  leaf: {
    height: 30,
    width: 29,
    borderRadius: 10,
    backgroundColor: '#8CA578',
    transform: [{ rotate: '18deg' }],
    borderBottomWidth: 5,
    borderRightWidth: 4,
    borderColor: '#799365',
  },
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  hint: {
    backgroundColor: '#F7F3EAEF',
    flexDirection: 'row',
    gap: 6,
    padding: 9,
    borderRadius: 12,
    flexShrink: 1,
  },
});
