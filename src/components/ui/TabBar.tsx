import type { ComponentProps } from 'react';
import { router, type Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BookOpen,
  History,
  House,
  ScanLine,
  Sparkle,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { colors, fonts } from '@/theme/tokens';
import { Raised } from './Game';
import { Text } from './Text';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Nhà', icon: House },
  learn: { label: 'Learn', icon: BookOpen },
  results: { label: 'Kết quả', icon: History },
  profile: { label: 'Tôi', icon: User },
};

/** Figma "Game tab bar": four tabs around a raised centre "Quét QR" button that opens the scanner. */
export function GameTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((route) => TABS[route.name]);
  const tab = (route: (typeof state.routes)[number]) => {
    const meta = TABS[route.name];
    const focused = state.routes[state.index]?.key === route.key;
    const Icon = meta.icon;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={meta.label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        style={styles.tab}
      >
        <Raised
          depth={focused ? 3 : 0}
          shadow={colors.emberShadow}
          radius={14}
          faceStyle={[styles.iconBox, focused && styles.iconBoxActive]}
        >
          <Icon size={22} color={focused ? colors.emberForeground : colors.dim} strokeWidth={2} />
        </Raised>
        <Text style={[styles.label, focused && styles.labelActive]}>{meta.label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {routes.slice(0, 2).map(tab)}
      <View style={styles.tab}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quét QR tòa nhà"
          onPress={() => router.push('/scan-qr')}
          style={styles.fabWrap}
        >
          {({ pressed }) => (
            <Raised
              depth={5}
              shadow={colors.emberShadow}
              radius={22}
              pressed={pressed}
              style={styles.fabGlow}
              faceStyle={styles.fab}
            >
              <ScanLine size={32} color={colors.emberForeground} strokeWidth={2} />
            </Raised>
          )}
        </Pressable>
        <Text style={styles.fabLabel}>QUÉT</Text>
      </View>
      {routes.slice(2).map(tab)}
    </View>
  );
}

/** Floating "Hỏi AI" shortcut shown above the tab bar on Learn and Kết quả. */
export function AiFab({ params }: { params?: Record<string, string> }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Hỏi AI"
      onPress={() => router.push({ pathname: '/ai', params })}
      style={styles.aiFab}
    >
      {({ pressed }) => (
        <Raised radius={16} depth={4} pressed={pressed} faceStyle={styles.aiFace}>
          <Sparkle size={18} color={colors.ember} strokeWidth={2} />
          <Text style={styles.aiLabel}>Hỏi AI</Text>
        </Raised>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingTop: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.lineStrong,
  },
  tab: { width: 72, alignItems: 'center', gap: 3 },
  iconBox: {
    width: 58,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconBoxActive: { backgroundColor: colors.ember, borderColor: colors.bg },
  label: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15, color: colors.dim },
  labelActive: { fontFamily: fonts.extrabold, color: colors.ember },
  fabWrap: { marginTop: -36, height: 73 },
  fabGlow: {
    borderRadius: 22,
    shadowColor: colors.ember,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  fab: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ember,
    borderWidth: 5,
    borderColor: colors.bg,
  },
  fabLabel: {
    marginTop: 2,
    fontFamily: fonts.black,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
    color: colors.ember,
  },
  aiFab: { position: 'absolute', right: 16, bottom: 14 },
  aiFace: {
    height: 46,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  aiLabel: { fontFamily: fonts.black, fontSize: 13, lineHeight: 18 },
});
